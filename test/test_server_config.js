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

          describe('#maxAge', function () {
            it('is a Number greater than -1', function () {
              cookie.maxAge.should.be.a.Number
              cookie.maxAge.should.be.above(-1)
            })
          })

        })

        describe('#hash', function () {
          let hash = session.hash

          it('is a plain old javascript object', function () {
            hash.should.be.an.Object
          })

          describe('#salt', function () {
            it('is a String', function () {
              hash.salt.should.be.a.String
            })
          })
        })

        describe('#key', function () {
          let key = session.key

          it('is a String', function () {
            key.should.be.a.String
          })
        })

        describe('#resave', function () {
          let resave = session.resave

          it('is a boolean', function () {
            ('boolean' === typeof resave).should.be.true
          })
        })

        describe('#saveUninitialized', function () {
          let saveUninitialized = session.saveUninitialized

          it('is a boolean', function () {
            ('boolean' === typeof saveUninitialized).should.be.true
          })
        })

        describe('#secret', function () {
          let secret = session.secret

          it('is a String', function () {
            secret.should.be.a.String
          })
        })

      })

      describe('#ssl', function () {
        let ssl = http.ssl

        it('is a plain old javascript object', function () {
          ssl.should.be.an.Object
        })

        describe('#cert', function () {
          it('is a string', function () {
            ssl.cert.should.be.a.String
          })
        })

        describe('#key', function () {
          it('is a string', function () {
            ssl.key.should.be.a.String
          })
        })

        describe('#prefix', function () {
          it('is a string', function () {
            ssl.prefix.should.be.a.String
          })
        })


      })

    })

    describe('#mongoose', function () {
      let mongoose = config.mongoose

      it('is a plain old javascript object', function () {
        mongoose.should.be.an.Object
      })

      describe('#conversationCollectionName', function () {
        it('is a string', function () {
          mongoose.conversationCollectionName.should.be.a.String
        })
      })

      describe('#conversationModelName', function () {
        it('is a string', function () {
          mongoose.conversationModelName.should.be.a.String
        })
      })

      describe('#options', function () {
        let options = mongoose.options

        it('is a plain old javascript object', function () {
          options.should.be.an.Object
        })

        describe('#auto_reconnect', function () {
          it('is a boolean', function () {
            ('boolean' === typeof options.auto_reconnect).should.be.true
          })
        })
      })

      describe('#personCollectionName', function () {
        it('is a string', function () {
          mongoose.personCollectionName.should.be.a.String
        })
      })

      describe('#personModelName', function () {
        it('is a string', function () {
          mongoose.personModelName.should.be.a.String
        })
      })  

      describe('#uri', function () {
        it('is a string', function () {
          mongoose.uri.should.be.a.String
        })
      })


    })



  })
}

function isValidPort (port) {
  it('is a number between 0 and 49151', function () {
    port.should.be.a.Number
    port.should.be.within(0, 49151)
  })
}
