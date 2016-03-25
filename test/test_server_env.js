"use strict";

let net = require('net');
let path = require('path');
let util = require('util');

let validURL = require('valid-url');

let config = require('../lib/config');

module.exports = env => {
  describe('env', () => {
      
    it('is frozen', () => {
      Object.isFrozen(env).should.be.true;
    });

    describe('#prefix', () => {
      let prefix = env.prefix;
      it('is a string', () => {
        prefix.should.be.a.String;
      });

      let resolved = path.resolve(__dirname, '..')

      it('equals "' + resolved + '"', () => {
        prefix.should.equal(resolved);
      });
    });

    describe('#package', () => {
      let pkg = env.package

      it('matches the value of package.json', () => {
        pkg.should.deepEqual(require('../package.json'));
      });
    });

    describe('#resolvePath()', () => {
      let resolvePath = env.resolvePath;

      it('is a function', () => {
        resolvePath.should.be.a.Function;
      });

      it('resolves "test" to "' + __dirname + '"', () => {
        let resolved = resolvePath('test');

        resolved.should.equal(path.resolve(__dirname));
      });
    });

    describe('#context()', () => {
      let context = env.context;

      it('is a function', () => {
        context.should.be.a.Function;
      });

      let testContext = env.package.name + ":test" 

      it('returns "' + testContext + '" when passed "test"', () => {
        context('test').should.equal(testContext);
      });
    });

    describe('#net', () => {

      describe('#addresses', () => {
        let addresses = env.net.addresses;

        it('is an array of IP addresses', () => {
          addresses.should.be.an.Array;

          for (let i = 0; i < addresses.length; i++) {
            let address = addresses[i];

            if (address.includes('.')) {
              net.isIPv4(address).should.be.true;
            } else if (address.includes(':')) {
              net.isIPv6(address).should.be.true;
            } else {
              (true).should.be.false;
            }
          }
        });


      });

      describe('#host', () => {
        let host = env.net.host;

        it('is a string or is null', () => {
          if (null !== host) {
            host.should.be.a.String;
          }
        })
      });

      describe('#port', () => {
        let port = env.net.port;

        it('is an integer 0-65535', () => {
          port.should.be.a.Number;
          port.should.be.within(0, 65535);
        })
      });

    });

    describe('#serverName', () => {
      let serverName = env.serverName;

      it('is a string equal to "' + config.serverName + '"', () => {
        serverName.should.be.a.String;
        serverName.should.equal(config.serverName);
      });
    });

    describe('#url()', () => {
      it('is a function', () => {
        env.url.should.be.a.Function;
      });

      it('returns a valid URL', () => {
        validURL.isUri(env.url()).should.be.true;
      });

      it('equals value of env.hostname, if set; otherwise, it equals first net address', () => {
        let url = env.url();

        let format = 'https://%s:%s';

        if (env.net.host) {
          url.should.equal(util.format(format, env.net.host, env.net.port));
        } else {
          url.should.equal(util.format(format, env.net.addresses[0], env.net.port));
        }

      });

    });

    describe('#banner()', () => {
      it('is a function', () => {
        env.banner.should.be.a.Function;
      });

      it('should return a 2 line string when process.env.DEBUG is falsey', () => {

        let originalDebug

        if (process.env.DEBUG) {
          originalDebug = process.env.DEBUG
        }
        
        delete process.env.DEBUG

        let banner = env.banner();

        banner.split('\n').should.have.length(2);  

        if (originalDebug) {
          process.env.DEBUG = originalDebug
        }

      });

      it('should return a 24 line string when process.env.DEBUG is truthy', () => {

        let originalDebug = process.env.DEBUG
        
        process.env.DEBUG = true;

        let banner = env.banner();

        banner.split('\n').should.have.length(24);

        process.env.DEBUG = originalDebug

      });
    });
  });
};
