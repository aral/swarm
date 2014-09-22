"use strict";

var env = require('./env');
var Spec = require('./Spec');

module.exports = {

    deliver: function (spec,val,source) {
        if (this.isMounted()) {
            this.forceUpdate();
        }
    },

    componentWillMount: function () {
        var self = this;
        var spec = this.props.spec || this.props.key;
        if (!Spec.is(spec)) {
            if (this.constructor.modelType) {
                var id = spec;
                spec = new Spec(this.constructor.modelType,'/'); // TODO fn!!!
                spec = spec.add(id,'#');
            } else {
                throw new Error('not a specifier: '+spec);
            }
        }
        this.sync = env.localhost.get(spec);
        this.sync.on('.init', this); // TODO single listener
        this.sync.on(this);
        if (typeof(this.sync.onObjectEvent)==='function') {
            this.sync.onObjectEvent(this);
        }
    },

    componentWillUnmount: function () {
        this.sync.off(this);
        if (typeof(this.sync.onObjectEvent)==='function') {
            this.sync.offObjectEvent(this);
        }
    }

};