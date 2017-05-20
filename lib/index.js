'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _graphqlServerExpress = require('graphql-server-express');

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _parseServer = require('parse-server');

var _cors = require('cors');

var _cors2 = _interopRequireDefault(_cors);

var _http = require('http');

var _subscriptionsTransportWs = require('subscriptions-transport-ws');

var _schemaPrinter = require('graphql/utilities/schemaPrinter');

var _parseServerAzureStorage = require('parse-server-azure-storage');

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _dockerLinks = require('docker-links');

var _dockerLinks2 = _interopRequireDefault(_dockerLinks);

var _subscriptions = require('./graphql/subscriptions');

var _schema = require('./graphql/schema');

var _schema2 = _interopRequireDefault(_schema);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var GRAPHQL_PORT = 8080;
var WS_PORT = 8090;

var links = _dockerLinks2.default.parseLinks(process.env);

var databaseUri = process.env.DATABASE_URI || process.env.MONGODB_URI;

if (!databaseUri) {
  if (links.mongo) {
    databaseUri = 'mongodb://' + links.mongo.hostname + ':' + links.mongo.port + '/dev';
  }
}

if (!databaseUri) {
  console.log('DATABASE_URI not specified, falling back to localhost.');
}

var facebookAppIds = process.env.FACEBOOK_APP_IDS;

if (facebookAppIds) {
  facebookAppIds = facebookAppIds.split(',');
}

var gcmId = process.env.GCM_ID;
var gcmKey = process.env.GCM_KEY;

var iosPushConfigs = [];
var isFile = function isFile(f) {
  var b = false;
  try {
    b = _fs2.default.statSync(f).isFile();
  } catch (e) {}
  return b;
};

var productionBundleId = process.env.PRODUCTION_BUNDLE_ID;
var productionPfx = process.env.PRODUCTION_PFX || '/certs/production-pfx.p12';
productionPfx = isFile(productionPfx) ? productionPfx : null;
var productionCert = process.env.PRODUCTION_CERT || '/certs/production-pfx-cert.pem';
productionCert = isFile(productionCert) ? productionCert : null;
var productionKey = process.env.PRODUCTION_KEY || '/certs/production-pfx-key.pem';
productionKey = isFile(productionKey) ? productionKey : null;
var productionPassphrase = process.env.PRODUCTION_PASSPHRASE || null;
var productionPushConfig = void 0;
if (productionBundleId && (productionPfx || productionCert && productionKey)) {
  productionPushConfig = {
    pfx: productionPfx,
    cert: productionCert,
    key: productionKey,
    passphrase: productionPassphrase,
    bundleId: productionBundleId,
    production: true
  };
  iosPushConfigs.push(productionPushConfig);
}

var devBundleId = process.env.DEV_BUNDLE_ID;
var devPfx = process.env.DEV_PFX || '/certs/dev-pfx.p12';
devPfx = isFile(devPfx) ? devPfx : null;
var devCert = process.env.DEV_CERT || '/certs/dev-pfx-cert.pem';
devCert = isFile(devCert) ? devCert : null;
var devKey = process.env.DEV_KEY || '/certs/dev-pfx-key.pem';
devKey = isFile(devKey) ? devKey : null;
var devPassphrase = process.env.DEV_PASSPHRASE || null;
var devPushConfig = void 0;
if (devBundleId && (devPfx || devCert && devKey)) {
  // exsiting files if not null
  devPushConfig = {
    pfx: devPfx,
    cert: devCert,
    key: devKey,
    passphrase: devPassphrase,
    bundleId: devBundleId,
    production: false
  };
  iosPushConfigs.push(devPushConfig);
}

if (process.env.APNS_BUNDLES_ID && process.env.APNS_BUNDLES_P12 && process.env.APNS_BUNDLES_PROD) {
  var APNSBundlesId = process.env.APNS_BUNDLES_ID.split(',').map(function (entry) {
    return entry.trim();
  });
  var APNSBundlesP12 = process.env.APNS_BUNDLES_P12.split(',').map(function (entry) {
    return entry.trim();
  });
  var APNSBundlesProd = process.env.APNS_BUNDLES_PROD.split(',').map(function (entry) {
    return entry.trim();
  });
  if (APNSBundlesId.length === APNSBundlesP12.length && APNSBundlesP12.length === APNSBundlesProd.length) {
    for (var i = 0; i < APNSBundlesId.length; i++) {
      var APNSpushConfig = {
        pfx: APNSBundlesP12[i],
        bundleId: APNSBundlesId[i],
        production: APNSBundlesProd[i] === 'true' ? true : false
      };
      iosPushConfigs.push(APNSpushConfig);
    }
  }
}

var pushConfig = {};
if (gcmId && gcmKey) {
  pushConfig.android = {
    senderId: gcmId,
    apiKey: gcmKey
  };
}
if (iosPushConfigs.length > 0) {
  pushConfig.ios = iosPushConfigs;
  //console.log('Multiple iOS push configurations.')
}
console.log(pushConfig);

var port = process.env.PORT || 1337;
// Serve the Parse API on the /parse URL prefix
var mountPath = process.env.PARSE_MOUNT || '/parse';
var serverURL = process.env.SERVER_URL || 'http://localhost:' + port + mountPath; // Don't forget to change to https if needed

var S3Adapter = require('parse-server').S3Adapter;
var GCSAdapter = require('parse-server').GCSAdapter;
//var FileSystemAdapter = require('parse-server').FileSystemAdapter;
var filesAdapter = void 0;

if (process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && process.env.S3_BUCKET) {
  var directAccess = !!+process.env.S3_DIRECT;

  filesAdapter = new S3Adapter(process.env.S3_ACCESS_KEY, process.env.S3_SECRET_KEY, process.env.S3_BUCKET, { directAccess: directAccess });
} else if (process.env.GCP_PROJECT_ID && process.env.GCP_KEYFILE_PATH && process.env.GCS_BUCKET) {
  var _directAccess = !!+process.env.GCS_DIRECT;

  filesAdapter = new GCSAdapter(process.env.GCP_PROJECT_ID, process.env.GCP_KEYFILE_PATH, process.env.GCS_BUCKET, { directAccess: _directAccess });
} else if (process.env.AZURE_ACCOUNT && process.env.AZURE_CONTAINER && process.env.AZURE_ACCESS_KEY) {
  var _directAccess2 = !!+process.env.AZURE_DIRECT;

  filesAdapter = new _parseServerAzureStorage.AzureStorageAdapter(process.env.AZURE_ACCOUNT, process.env.AZURE_CONTAINER, {
    accessKey: process.env.AZURE_ACCESS_KEY,
    directAccess: _directAccess2
  });
}

var emailModule = process.env.EMAIL_MODULE;
var verifyUserEmails = !!+process.env.VERIFY_USER_EMAILS;
var emailAdapter = void 0;
if (!emailModule) {
  verifyUserEmails = false;
} else {
  emailAdapter = {
    module: emailModule,
    options: {
      fromAddress: process.env.EMAIL_FROM,
      domain: process.env.EMAIL_DOMAIN,
      apiKey: process.env.EMAIL_API_KEY
    }
  };
}
console.log(verifyUserEmails);
console.log(emailModule);
console.log(emailAdapter);

var enableAnonymousUsers = !!+process.env.ENABLE_ANON_USERS;
var allowClientClassCreation = !!+process.env.ALLOW_CLIENT_CLASS_CREATION;

var liveQuery = process.env.LIVEQUERY_SUPPORT;
console.log('LIVEQUERY_SUPPORT: ' + liveQuery);
var liveQueryParam = void 0;
if (liveQuery) {
  var liveQueryClasses = process.env.LIVEQUERY_CLASSES.split(',').map(function (entry) {
    return entry.trim();
  });
  console.log('LIVEQUERY_CLASSES: ' + liveQueryClasses);

  liveQueryParam = {
    classNames: liveQueryClasses
  };
}

var databaseOptions = {};
if (process.env.DATABASE_TIMEOUT) {
  databaseOptions = {
    socketTimeoutMS: +process.env.DATABASE_TIMEOUT
  };
}

var auth = {};
for (var env in process.env) {
  if (!process.env.hasOwnProperty(env)) {
    break;
  }

  var env_parameters = /^AUTH_([^_]*)_(.+)/.exec(env);

  if (env_parameters !== null) {
    if (typeof auth[env_parameters[1].toLowerCase()] === 'undefined') {
      auth[env_parameters[1].toLowerCase()] = {};
    }

    auth[env_parameters[1].toLowerCase()][env_parameters[2].toLowerCase()] = process.env[env];
  }
}

var appId = process.env.APP_ID || 'myAppId';
var masterKey = process.env.MASTER_KEY || 'myMasterKey';

var api = new _parseServer.ParseServer({
  databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
  databaseOptions: databaseOptions,
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',

  appId: appId,
  masterKey: masterKey,
  serverURL: serverURL,

  collectionPrefix: process.env.COLLECTION_PREFIX,
  clientKey: process.env.CLIENT_KEY,
  restAPIKey: process.env.REST_API_KEY,
  javascriptKey: process.env.JAVASCRIPT_KEY,
  dotNetKey: process.env.DOTNET_KEY,
  fileKey: process.env.FILE_KEY || 'optionalFileKey',
  filesAdapter: filesAdapter,

  auth: auth,
  facebookAppIds: facebookAppIds,
  maxUploadSize: process.env.MAX_UPLOAD_SIZE,
  push: pushConfig,
  verifyUserEmails: verifyUserEmails,
  emailAdapter: emailAdapter,
  enableAnonymousUsers: enableAnonymousUsers,
  allowClientClassCreation: allowClientClassCreation,
  // oauth = {},
  appName: process.env.APP_NAME,
  publicServerURL: process.env.PUBLIC_SERVER_URL,
  liveQuery: liveQueryParam,
  logLevel: process.env.LOG_LEVEL || 'info'
});

console.log('appId: ' + appId);
console.log('masterKey: ' + masterKey);

var app = (0, _express2.default)().use('*', (0, _cors2.default)());

var trustProxy = !!+(process.env.TRUST_PROXY || '1'); // default enable trust
if (trustProxy) {
  console.log('trusting proxy: ' + process.env.TRUST_PROXY);
  app.enable('trust proxy');
}

app.use(mountPath, api);

// Parse Server plays nicely with the rest of your web routes
app.get('/', function (req, res) {
  res.status(200).send('I dream of being a web site.');
});

// GraphQL
var isSupportGraphQL = process.env.GRAPHQL_SUPPORT || true;
var schemaURL = process.env.GRAPHQL_SCHEMA || './cloud/graphql/schema.js';

console.log('isSupportGraphQL: ', isSupportGraphQL);
console.log('schemaURL: ', schemaURL);

if (isSupportGraphQL) {
  console.log('Starting GraphQL...');

  app.use('/graphql', _bodyParser2.default.json(), (0, _graphqlServerExpress.graphqlExpress)({
    schema: _schema2.default,
    context: {}
  }));

  app.use('/graphiql', (0, _graphqlServerExpress.graphiqlExpress)({
    endpointURL: '/graphql'
  }));

  app.use('/schema', function (req, res) {
    res.set('Content-Type', 'text/plain');
    res.send((0, _schemaPrinter.printSchema)(_schema2.default));
  });
}

if (liveQuery) {
  console.log('Starting live query server');
  var httpServer = require('http').createServer(app);
  httpServer.listen(port);
  console.log('plac');
  var parseLiveQueryServer = _parseServer.ParseServer.createLiveQueryServer(httpServer);
} else {
  app.listen(port, function () {
    return console.log('docker-parse-server running on ' + serverURL + ' (:' + port + mountPath + ')');
  });
}

// WebSocket server for subscriptions
var websocketServer = (0, _http.createServer)(function (request, response) {
  response.writeHead(404);
  response.end();
});

websocketServer.listen(WS_PORT, function () {
  return console.log(
  // eslint-disable-line no-console
  'Websocket Server is now running on http://localhost:' + WS_PORT);
});

// eslint-disable-next-line
new _subscriptionsTransportWs.SubscriptionServer({ subscriptionManager: _subscriptions.subscriptionManager }, websocketServer);