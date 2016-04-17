"use strict"

require('should')

let path = require('path')

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

    beforeEach(function (done) {

      server.start(() => {
        data.user.remove({}, function () {
          data.user.create({ username: 'jeff' }, done)
        })
      })
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
