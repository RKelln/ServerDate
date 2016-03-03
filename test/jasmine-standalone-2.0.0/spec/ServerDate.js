describe("ServerDate", function () {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 12000;

	describe("constructor", function () {
		it("returns a string when called without new", function () {
			expect(typeof(ServerDate())).toBe('string');
		});

		it("returns itself when called with new", function () {
		  expect(new ServerDate()).toBe(ServerDate);
		});

		it("parse is the same as Date.parse", function () {
			expect(ServerDate.parse).toBe(Date.parse);
		});

		it("UTC is the same as Date.UTC", function () {
			expect(ServerDate.UTC).toBe(Date.UTC);
		});

		it("now returns a number", function () {
			expect(typeof(ServerDate.now())).toBe('number');
		});
	});

	describe("immutable methods return the same type as their Date counterparts",
	  function () {
	  var
	    date;

	  date = new Date();

    ['toString', 'toDateString', 'toTimeString', 'toLocaleString',
      'toLocaleDateString', 'toLocaleTimeString', 'valueOf', 'getTime',
      'getFullYear', 'getUTCFullYear', 'getMonth', 'getUTCMonth', 'getDate',
      'getUTCDate', 'getDay', 'getUTCDay', 'getHours', 'getUTCHours',
      'getMinutes', 'getUTCMinutes', 'getSeconds', 'getUTCSeconds',
      'getMilliseconds', 'getUTCMilliseconds', 'getTimezoneOffset', 'toUTCString',
      'toISOString', 'toJSON']
      .forEach(function (method) {
        it(method, function () {
          expect(typeof(ServerDate[method]())).toBe(typeof(date[method]()));
        });
      });
  });

  describe("mutable Date methods are undefined", function () {
    ['setDate', 'setFullYear', 'setHours', 'setMilliseconds', 'setMinutes',
      'setMonth', 'setSeconds', 'setTime', 'setUTCDate', 'setUTCFullYear',
      'setUTCHours', 'setUTCMilliseconds', 'setUTCMinutes', 'setUTCMonth',
      'setUTCSeconds', 'setYear']
      .forEach(function (method) {
        it(method, function () {
          expect(ServerDate[method]).toBe(undefined);
        });
      });
  });

  describe("additional methods not found in Date", function () {
    it("sync() manually triggers a synchronization which fires a callback when completed", function (done) {
      ServerDate.sync({
        callback: function(success, newTarget, oldTarget) {
          expect(typeof success).toBe('boolean');
          expect(typeof newTarget).toBe('object');
          expect(typeof newTarget.precision).toBe('number');
          expect(typeof newTarget.value).toBe('number');
          expect(typeof oldTarget).toBe('object');
          expect(typeof oldTarget.precision).toBe('number');
          expect(typeof oldTarget.value).toBe('number');
          done();
        },
        sampleCount: 1,
        force: true
      });
    });

    it("on() binds a synchronization callback listener", function (done) {
      ServerDate.on(function(success, newTarget, oldTarget) {
        expect(success).toBe(true);
        ServerDate.off();
        done();
      });
      ServerDate.sync();
    });

    it("off() removes the synchronization callback listener", function (done) {
      var cb = function(success, newTarget, oldTarget) {
        //If this fires, we auto-fail
        if (cb) {
          console.log(cb);
          cb = undefined;
          expect(1).toBe(2);
          done();
        }
      };
      ServerDate.on(cb);
      ServerDate.off(cb);
      ServerDate.sync();
      setTimeout(function() {
        if (cb) {
          cb = undefined;
          expect(1).toBe(1);
          done();
        }
      }, 10000);
    });

    it("getPrecision() returns a number", function () {
      expect(typeof(ServerDate.getPrecision())).toBe('number');
    });
  });

  describe("additional properties not found in Date", function () {

    describe("defaults are set", function () {
      it("amortizationRate default is set", function () {
        expect(ServerDate.config.amortizationRate).toBeDefined();
        expect(ServerDate.amortizationRate).toBe(ServerDate.config.amortizationRate);
      });

      it("amortizationThreshold default is set", function () {
        expect(ServerDate.config.amortizationThreshold).toBeDefined();
        expect(ServerDate.amortizationThreshold).toBe(ServerDate.config.amortizationThreshold);
      });

      it("synchronizationIntervalDelay default is set", function () {
        expect(ServerDate.config.synchronizationIntervalDelay).toBeDefined();
        expect(ServerDate.synchronizationIntervalDelay).toBe(ServerDate.config.synchronizationIntervalDelay);
      });

      it("synchronizationRequestSamples default is set", function () {
        expect(ServerDate.config.synchronizationRequestSamples).toBeDefined();
        expect(ServerDate.synchronizationRequestSamples).toBe(ServerDate.config.synchronizationRequestSamples);
      });

      it("syncronizationTimeout default is set", function () {
        expect(ServerDate.config.syncronizationTimeout).toBeDefined();
        expect(ServerDate.syncronizationTimeout).toBe(ServerDate.config.syncronizationTimeout);
      });
    });

    describe("defaults can be overridden", function () {
      var testConfig = {
        amortizationRate: ServerDate.amortizationRate + 1,
        amortizationThreshold: ServerDate.amortizationThreshold + 1,
        synchronizationIntervalDelay: ServerDate.synchronizationIntervalDelay + 1,
        synchronizationRequestSamples: ServerDate.synchronizationRequestSamples + 1,
        syncronizationTimeout: ServerDate.syncronizationTimeout + 1
      };

      beforeEach(function() {
        ServerDate.init(testConfig)
      });


      it("amortizationRate default is overridden", function () {
        expect(ServerDate.amortizationRate).toBe(testConfig.amortizationRate);
      });

      it("amortizationThreshold default is overridden", function () {
        expect(ServerDate.amortizationThreshold).toBe(testConfig.amortizationThreshold);
      });

      it("synchronizationIntervalDelay default is overridden", function () {
        expect(ServerDate.synchronizationIntervalDelay).toBe(testConfig.synchronizationIntervalDelay);
      });

      it("synchronizationRequestSamples default is overridden", function () {
        expect(ServerDate.synchronizationRequestSamples).toBe(testConfig.synchronizationRequestSamples);
      });

      it("syncronizationTimeout default is overridden", function () {
        expect(ServerDate.syncronizationTimeout).toBe(testConfig.syncronizationTimeout);
      });
    });
  });


});
