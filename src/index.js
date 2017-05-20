import express from 'express';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import bodyParser from 'body-parser';
import { ParseServer } from 'parse-server';
import cors from 'cors';
import { createServer } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { printSchema } from 'graphql/utilities/schemaPrinter';
import { AzureStorageAdapter } from 'parse-server-azure-storage';

import path from 'path';
import fs from 'fs';
import dockerLinks from 'docker-links';

import { subscriptionManager } from './graphql/subscriptions';
import schema from './graphql/schema';

const GRAPHQL_PORT = 8080;
const WS_PORT = 8090;

const links = dockerLinks.parseLinks(process.env);

let databaseUri = process.env.DATABASE_URI || process.env.MONGODB_URI;

if (!databaseUri) {
  if (links.mongo) {
    databaseUri = `mongodb://${links.mongo.hostname}:${links.mongo.port}/dev`;
  }
}

if (!databaseUri) {
  console.log('DATABASE_URI not specified, falling back to localhost.');
}

let facebookAppIds = process.env.FACEBOOK_APP_IDS;

if (facebookAppIds) {
  facebookAppIds = facebookAppIds.split(',');
}

const gcmId = process.env.GCM_ID;
const gcmKey = process.env.GCM_KEY;

const iosPushConfigs = [];
const isFile = f => {
  let b = false;
  try {
    b = fs.statSync(f).isFile();
  } catch (e) {}
  return b;
};

const productionBundleId = process.env.PRODUCTION_BUNDLE_ID;
let productionPfx = process.env.PRODUCTION_PFX || '/certs/production-pfx.p12';
productionPfx = isFile(productionPfx) ? productionPfx : null;
let productionCert =
  process.env.PRODUCTION_CERT || '/certs/production-pfx-cert.pem';
productionCert = isFile(productionCert) ? productionCert : null;
let productionKey =
  process.env.PRODUCTION_KEY || '/certs/production-pfx-key.pem';
productionKey = isFile(productionKey) ? productionKey : null;
const productionPassphrase = process.env.PRODUCTION_PASSPHRASE || null;
let productionPushConfig;
if (
  productionBundleId &&
  (productionPfx || (productionCert && productionKey))
) {
  productionPushConfig = {
    pfx: productionPfx,
    cert: productionCert,
    key: productionKey,
    passphrase: productionPassphrase,
    bundleId: productionBundleId,
    production: true,
  };
  iosPushConfigs.push(productionPushConfig);
}

const devBundleId = process.env.DEV_BUNDLE_ID;
let devPfx = process.env.DEV_PFX || '/certs/dev-pfx.p12';
devPfx = isFile(devPfx) ? devPfx : null;
let devCert = process.env.DEV_CERT || '/certs/dev-pfx-cert.pem';
devCert = isFile(devCert) ? devCert : null;
let devKey = process.env.DEV_KEY || '/certs/dev-pfx-key.pem';
devKey = isFile(devKey) ? devKey : null;
const devPassphrase = process.env.DEV_PASSPHRASE || null;
let devPushConfig;
if (devBundleId && (devPfx || (devCert && devKey))) {
  // exsiting files if not null
  devPushConfig = {
    pfx: devPfx,
    cert: devCert,
    key: devKey,
    passphrase: devPassphrase,
    bundleId: devBundleId,
    production: false,
  };
  iosPushConfigs.push(devPushConfig);
}

if (
  process.env.APNS_BUNDLES_ID &&
  process.env.APNS_BUNDLES_P12 &&
  process.env.APNS_BUNDLES_PROD
) {
  const APNSBundlesId = process.env.APNS_BUNDLES_ID.split(',').map(entry => {
    return entry.trim();
  });
  const APNSBundlesP12 = process.env.APNS_BUNDLES_P12.split(',').map(entry => {
    return entry.trim();
  });
  const APNSBundlesProd = process.env.APNS_BUNDLES_PROD
    .split(',')
    .map(entry => {
      return entry.trim();
    });
  if (
    APNSBundlesId.length === APNSBundlesP12.length &&
    APNSBundlesP12.length === APNSBundlesProd.length
  ) {
    for (let i = 0; i < APNSBundlesId.length; i++) {
      const APNSpushConfig = {
        pfx: APNSBundlesP12[i],
        bundleId: APNSBundlesId[i],
        production: APNSBundlesProd[i] === 'true' ? true : false,
      };
      iosPushConfigs.push(APNSpushConfig);
    }
  }
}

var pushConfig = {};
if (gcmId && gcmKey) {
  pushConfig.android = {
    senderId: gcmId,
    apiKey: gcmKey,
  };
}
if (iosPushConfigs.length > 0) {
  pushConfig.ios = iosPushConfigs;
  //console.log('Multiple iOS push configurations.')
}
console.log(pushConfig);

const port = process.env.PORT || 1337;
// Serve the Parse API on the /parse URL prefix
const mountPath = process.env.PARSE_MOUNT || '/parse';
const serverURL =
  process.env.SERVER_URL || 'http://localhost:' + port + mountPath; // Don't forget to change to https if needed

const S3Adapter = require('parse-server').S3Adapter;
const GCSAdapter = require('parse-server').GCSAdapter;
//var FileSystemAdapter = require('parse-server').FileSystemAdapter;
let filesAdapter;

if (
  process.env.S3_ACCESS_KEY &&
  process.env.S3_SECRET_KEY &&
  process.env.S3_BUCKET
) {
  const directAccess = !!+process.env.S3_DIRECT;

  filesAdapter = new S3Adapter(
    process.env.S3_ACCESS_KEY,
    process.env.S3_SECRET_KEY,
    process.env.S3_BUCKET,
    { directAccess }
  );
} else if (
  process.env.GCP_PROJECT_ID &&
  process.env.GCP_KEYFILE_PATH &&
  process.env.GCS_BUCKET
) {
  const directAccess = !!+process.env.GCS_DIRECT;

  filesAdapter = new GCSAdapter(
    process.env.GCP_PROJECT_ID,
    process.env.GCP_KEYFILE_PATH,
    process.env.GCS_BUCKET,
    { directAccess }
  );
} else if (
  process.env.AZURE_ACCOUNT &&
  process.env.AZURE_CONTAINER &&
  process.env.AZURE_ACCESS_KEY
) {
  const directAccess = !!+process.env.AZURE_DIRECT;

  filesAdapter = new AzureStorageAdapter(
    process.env.AZURE_ACCOUNT,
    process.env.AZURE_CONTAINER,
    {
      accessKey: process.env.AZURE_ACCESS_KEY,
      directAccess,
    }
  );
}

const emailModule = process.env.EMAIL_MODULE;
let verifyUserEmails = !!+process.env.VERIFY_USER_EMAILS;
let emailAdapter;
if (!emailModule) {
  verifyUserEmails = false;
} else {
  emailAdapter = {
    module: emailModule,
    options: {
      fromAddress: process.env.EMAIL_FROM,
      domain: process.env.EMAIL_DOMAIN,
      apiKey: process.env.EMAIL_API_KEY,
    },
  };
}
console.log(verifyUserEmails);
console.log(emailModule);
console.log(emailAdapter);

const enableAnonymousUsers = !!+process.env.ENABLE_ANON_USERS;
const allowClientClassCreation = !!+process.env.ALLOW_CLIENT_CLASS_CREATION;

const liveQuery = process.env.LIVEQUERY_SUPPORT;
console.log('LIVEQUERY_SUPPORT: ' + liveQuery);
let liveQueryParam;
if (liveQuery) {
  const liveQueryClasses = process.env.LIVEQUERY_CLASSES
    .split(',')
    .map(entry => entry.trim());
  console.log('LIVEQUERY_CLASSES: ' + liveQueryClasses);

  liveQueryParam = {
    classNames: liveQueryClasses,
  };
}

let databaseOptions = {};
if (process.env.DATABASE_TIMEOUT) {
  databaseOptions = {
    socketTimeoutMS: +process.env.DATABASE_TIMEOUT,
  };
}

const auth = {};
for (let env in process.env) {
  if (!process.env.hasOwnProperty(env)) {
    break;
  }

  const env_parameters = /^AUTH_([^_]*)_(.+)/.exec(env);

  if (env_parameters !== null) {
    if (typeof auth[env_parameters[1].toLowerCase()] === 'undefined') {
      auth[env_parameters[1].toLowerCase()] = {};
    }

    auth[env_parameters[1].toLowerCase()][env_parameters[2].toLowerCase()] =
      process.env[env];
  }
}

const appId = process.env.APP_ID || 'myAppId';
const masterKey = process.env.MASTER_KEY || 'myMasterKey';

const api = new ParseServer({
  databaseURI: databaseUri || 'mongodb://localhost:27017/dev',
  databaseOptions,
  cloud: process.env.CLOUD_CODE_MAIN || __dirname + '/cloud/main.js',

  appId,
  masterKey,
  serverURL,

  collectionPrefix: process.env.COLLECTION_PREFIX,
  clientKey: process.env.CLIENT_KEY,
  restAPIKey: process.env.REST_API_KEY,
  javascriptKey: process.env.JAVASCRIPT_KEY,
  dotNetKey: process.env.DOTNET_KEY,
  fileKey: process.env.FILE_KEY || 'optionalFileKey',
  filesAdapter,

  auth,
  facebookAppIds,
  maxUploadSize: process.env.MAX_UPLOAD_SIZE,
  push: pushConfig,
  verifyUserEmails,
  emailAdapter,
  enableAnonymousUsers,
  allowClientClassCreation,
  // oauth = {},
  appName: process.env.APP_NAME,
  publicServerURL: process.env.PUBLIC_SERVER_URL,
  liveQuery: liveQueryParam,
  logLevel: process.env.LOG_LEVEL || 'info',
  // customPages: process.env.CUSTOM_PAGES || // {
  // invalidLink: undefined,
  // verifyEmailSuccess: undefined,
  // choosePassword: undefined,
  // passwordResetSuccess: undefined
  // }
});

console.log(`appId: ${appId}`);
console.log(`masterKey: ${masterKey}`);

const app = express().use('*', cors());

const trustProxy = !!+(process.env.TRUST_PROXY || '1'); // default enable trust
if (trustProxy) {
  console.log(`trusting proxy: ${process.env.TRUST_PROXY}`);
  app.enable('trust proxy');
}

app.use(mountPath, api);

// Parse Server plays nicely with the rest of your web routes
app.get('/', (req, res) => {
  res.status(200).send('I dream of being a web site.');
});

// GraphQL
const isSupportGraphQL = process.env.GRAPHQL_SUPPORT || true;
const schemaURL = process.env.GRAPHQL_SCHEMA || './cloud/graphql/schema.js';

console.log('isSupportGraphQL: ', isSupportGraphQL);
console.log('schemaURL: ', schemaURL);

if (isSupportGraphQL) {
  console.log('Starting GraphQL...');

  app.use(
    '/graphql',
    bodyParser.json(),
    graphqlExpress({
      schema,
      context: {},
    })
  );

  app.use(
    '/graphiql',
    graphiqlExpress({
      endpointURL: '/graphql',
    })
  );

  app.use('/schema', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(printSchema(schema));
  });

}

if (liveQuery) {
  console.log('Starting live query server');
  var httpServer = require('http').createServer(app);
  httpServer.listen(port);
  console.log('plac');
  var parseLiveQueryServer = ParseServer.createLiveQueryServer(httpServer);
} else {
  app.listen(port, () =>
    console.log(
      `docker-parse-server running on ${serverURL} (:${port}${mountPath})`
    )
  );
}

// WebSocket server for subscriptions
const websocketServer = createServer((request, response) => {
  response.writeHead(404);
  response.end();
});

websocketServer.listen(WS_PORT, () =>
  console.log(
    // eslint-disable-line no-console
    `Websocket Server is now running on http://localhost:${WS_PORT}`
  )
);

// eslint-disable-next-line
new SubscriptionServer({ subscriptionManager }, websocketServer);
