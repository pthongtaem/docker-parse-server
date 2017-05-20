'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.pubsub = exports.subscriptionManager = undefined;

var _graphqlSubscriptions = require('graphql-subscriptions');

var _schema = require('./schema');

var _schema2 = _interopRequireDefault(_schema);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var pubsub = new _graphqlSubscriptions.PubSub();
var subscriptionManager = new _graphqlSubscriptions.SubscriptionManager({
  schema: _schema2.default,
  pubsub: pubsub
});

exports.subscriptionManager = subscriptionManager;
exports.pubsub = pubsub;