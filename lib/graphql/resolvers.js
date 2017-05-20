'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _lodash = require('lodash');

var _subscriptions = require('./subscriptions');

var authors = [{ id: 1, firstName: 'Tom', lastName: 'Coleman' }, { id: 2, firstName: 'Sashko', lastName: 'Stubailo' }];

var _posts = [{ id: 1, authorId: 1, title: 'Introduction to GraphQL', votes: 2 }, { id: 2, authorId: 2, title: 'GraphQL Rocks', votes: 3 }, { id: 3, authorId: 2, title: 'Advanced GraphQL', votes: 1 }];

var resolveFunctions = {
  Query: {
    posts: function posts() {
      return _posts;
    },
    author: function author(_, _ref) {
      var id = _ref.id;

      return (0, _lodash.find)(authors, { id: id });
    }
  },
  Mutation: {
    upvotePost: function upvotePost(_, _ref2) {
      var postId = _ref2.postId;

      var post = (0, _lodash.find)(_posts, { id: postId });
      if (!post) {
        throw new Error('Couldn\'t find post with id ' + postId);
      }
      post.votes += 1;
      _subscriptions.pubsub.publish('postUpvoted', post);
      return post;
    }
  },
  Subscription: {
    postUpvoted: function postUpvoted(post) {
      return post;
    }
  },
  Author: {
    posts: function posts(author) {
      return (0, _lodash.filter)(_posts, { authorId: author.id });
    }
  },
  Post: {
    author: function author(post) {
      return (0, _lodash.find)(authors, { id: post.authorId });
    }
  }
};

exports.default = resolveFunctions;