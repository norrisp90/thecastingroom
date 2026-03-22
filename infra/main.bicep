// ===========================================================
// The Casting Room — Azure Infrastructure (Bicep)
// ===========================================================
// Provisions: Cosmos DB (free tier), Container Apps (Consumption),
// Static Web App (Free), Storage Account, Application Insights.
// Does NOT provision Azure OpenAI (shared in "dungeon master" RG).

targetScope = 'resourceGroup'

@description('Location for all resources')
param location string = resourceGroup().location

@description('Base name for resources')
param baseName string = 'castingroom'

@description('Azure OpenAI endpoint (from dungeon master RG)')
@secure()
param azureOpenAiEndpoint string

@description('Azure OpenAI API key (from dungeon master RG)')
@secure()
param azureOpenAiApiKey string

@description('JWT secret for auth tokens')
@secure()
param jwtSecret string

@description('Frontend URL for CORS')
param frontendUrl string = ''

@description('Azure Container Registry name (without .azurecr.io)')
param acrName string = 'ca3e2fd943a5acr'

// --- Log Analytics Workspace ---
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${baseName}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// --- Application Insights ---
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${baseName}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --- Cosmos DB (Free Tier) ---
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${baseName}-cosmos'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    enableFreeTier: true
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'thecastingroom-db'
  properties: {
    resource: {
      id: 'thecastingroom-db'
    }
    options: {
      throughput: 1000
    }
  }
}

// Cosmos DB containers (shared throughput)
var containerDefinitions = [
  { name: 'Users', partitionKey: '/id' }
  { name: 'RefreshTokens', partitionKey: '/userId' }
  { name: 'Worlds', partitionKey: '/id' }
  { name: 'WorldPermissions', partitionKey: '/userId' }
  { name: 'Actors', partitionKey: '/worldId' }
  { name: 'Roles', partitionKey: '/worldId' }
  { name: 'AuditionSessions', partitionKey: '/worldId' }
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for def in containerDefinitions: {
    parent: cosmosDatabase
    name: def.name
    properties: {
      resource: {
        id: def.name
        partitionKey: {
          paths: [def.partitionKey]
          kind: 'Hash'
        }
      }
    }
  }
]

// --- Storage Account (Blob) ---
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: replace('${baseName}stor', '-', '')
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// --- Container Apps Environment ---
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${baseName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// --- Existing ACR ---
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// --- Container App (Backend API) ---
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${baseName}-api'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      registries: [
        {
          server: '${acrName}.azurecr.io'
          identity: 'system'
        }
      ]
      ingress: {
        external: true
        targetPort: 4000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        { name: 'cosmos-endpoint', value: cosmosAccount.properties.documentEndpoint }
        { name: 'cosmos-key', value: cosmosAccount.listKeys().primaryMasterKey }
        { name: 'openai-endpoint', value: azureOpenAiEndpoint }
        { name: 'openai-key', value: azureOpenAiApiKey }
        { name: 'jwt-secret', value: jwtSecret }
      ]
    }
    template: {
      containers: [
        {
          name: '${baseName}-api'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'PORT', value: '4000' }
            { name: 'NODE_ENV', value: 'production' }
            { name: 'COSMOS_ENDPOINT', secretRef: 'cosmos-endpoint' }
            { name: 'COSMOS_KEY', secretRef: 'cosmos-key' }
            { name: 'COSMOS_DATABASE', value: 'thecastingroom-db' }
            { name: 'AZURE_OPENAI_ENDPOINT', secretRef: 'openai-endpoint' }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'openai-key' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'FRONTEND_URL', value: frontendUrl }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// --- AcrPull role assignment for Container App managed identity ---
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull built-in role
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, containerApp.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// --- Static Web App (Frontend) ---
// SWA Free tier not available in all regions; westeurope is closest supported to uksouth
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${baseName}-web'
  location: 'westeurope'
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// --- Outputs ---
output apiUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output staticWebAppName string = staticWebApp.name
output cosmosAccountName string = cosmosAccount.name
output storageAccountName string = storageAccount.name
output appInsightsName string = appInsights.name
output containerAppName string = containerApp.name
output containerAppsEnvName string = containerAppsEnv.name
