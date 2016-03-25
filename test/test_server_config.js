"use strict"

require('should')

module.exports = function () {
  
  let config = require('../lib/config')

  describe('config', function () {

    it('is a plain old javascript object', function () {
      config.should.be.an.Object
    })

    console.log('config', config)

    describe('#serverName', function () {
      let serverName = config.serverName

      it('is a non-empty string', function () {
        serverName.should.be.a.String
        serverName.length.should.be.above(0)
      })
    })

    describe('#shutdownTimeout', function () {
      it('is a Number', function () {
        config.shutdownTimeout.should.be.a.Number
      })
    })

    describe('#cli', function () {
      it('is a plain old javascript object', function () {
        config.cli.should.be.an.object
      })

      describe('#port', function () { 
        isValidPort(config.cli.port) 
      })
    })

    describe('#http', function () {
      let http = config.http

      it('is a plain old javascript object', function () {
        config.http.should.be.an.Object
      })

      describe('#host', function () {
        let host = http.host
        it('is a non-empty String or null', function () {
          if (host) {
            host.should.be.a.String
            host.length.should.be.above(0)
          } else {
            (host === null).should.be.true
          }
        })
      })

      describe('#port', function () {
        isValidPort(http.port)
      })

      describe('#session', function () {
        let session = http.session

        it('is a plain old javascript object', function () {
          session.should.be.an.Object
        })

        describe('#cookie', function () {
          let cookie = session.cookie

          it('is a plain old javascript object', function () {
            cookie.should.be.an.Object
          })

          describe('#secure', function () {
            it('is true', function () {
              cookie.secure.should.be.true
            })
          })

        })
      })

      describe('#ssl', function () {})

    })



  })
}

function isValidPort (port) {
  it('is a number between 0 and 49151', function () {
    port.should.be.a.Number
    port.should.be.within(0, 49151)
  })
}
