var SectionView = require('./SectionView')
, app = require('../app')
, Backbone = require('backbone')
, _ = require('underscore')
, Models = require('../models')
, app = require('../app')
, sjcl = require('../vendor/sjcl')
, LoginView = module.exports = SectionView.extend({
    section: null,

    events: {
        'click button.login': 'login'
    },

    initialize: function() {
        this.model = new Models.User({}, {
            url: app.apiUrl + '/public/users'
        })
    },

    login: function(e) {
        e.preventDefault()
        var email = this.$el.find('.email').val().toLowerCase()
        , password = this.$el.find('.password').val()

        this.trigger('login', {
            hashes: app.hashCredentials(email, password)
        })
    },

    render: function() {
        var that = this
        this.$el.html(require('../templates/login.ejs')());

        setTimeout(function() {
            that.$el.find('.email').focus()
        }, 0)

        return this;
    }
})
