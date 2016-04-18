"use strict"

require('should')

let path = require('path')

let async = require('async')

module.exports = function (server) {

  let data = server.data
  
  let OffTheRecord_data = require(path.normalize('../lib/data'))

  describe('OffTheRecord_data', function () {

    it('is a Function named "OffTheRecord_data"', function () {
      OffTheRecord_data.should.be.a.Function
      OffTheRecord_data.name.should.equal('OffTheRecord_data')
    })

  })

  describe('#data', function () {
    let usernames = ['jeff', 'zane', 'kyle']
    let users = {}

    beforeEach(function (done) {

      async.series([
        startServer, 
        dropConvos,
        dropFriendships,
        dropUsers,
        addUsers, 
        addConvos,
        sendRequests,
        acceptRequest
      ], done)

      function startServer (next) {
        server.start(next)
      }

      function dropUsers (next) {
        data.user.remove({}, next)
      }

      function dropFriendships (next) {
        data.user.Friendship.remove({}, next)
      }

      function dropConvos (next) {
        data.conversation.remove({}, next)
      }

      function addConvos (next) {
        data.conversation.create({
          starter: users.jeff._id, 
          ivitees: [users.zane._id, users.kyle._id]
        }, next)
      }

      function addUsers (next) {
        async.each(usernames, function (user, done) {
          new data.user({username: user}).save((err, savedUser) => {
            users[user] = savedUser
            done(err)
          })
        }, next)
      }

      function sendRequests (next) {
        async.parallel({
          jeffToZane: function (done) {
            users.jeff.friendRequest(users.zane._id, done)
          },
          jeffToKyle: function (done) {
            users.jeff.friendRequest(users.kyle._id, done)
          }
        }, next)
      }

      function acceptRequest (next) {
        users.zane.acceptRequest(users.jeff._id, next)
      }

    })

    afterEach(function (done) {
      server.stop(done)
    })

    it('returns an instance of OffTheRecord_data', function () {
      data.should.be.an.instanceof(OffTheRecord_data)
    })

    describe('#user', function () {
      let user = data.user

      // console.log('user.prototype', user.prototype)

      it('is a Function named "model"', function () {
        user.should.be.a.Function
        user.name.should.equal('model')
      })

      // describe('#')

    })

    describe('#conversation', function () {})
    describe('#privacy', function () {})

    describe('#start', function () {})
    describe('#stop', function () {})
    describe('#disconnect', function () {})
    describe('#getConnection', function () {
      it('gets the current connection object', function () {
        data.getConnection().should.be.ok
      })
    })
    describe('#getSessionStore', function () {})

  })
}
