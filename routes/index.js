var async = require('async');
var express = require('express');
var router = express.Router();
var helpers = require(global.appRoot + '/modules/helpers.js');
var Datastore = require('nedb');
var db = new Object;
db.draft = new Datastore({ filename: 'data/draft.nedb', autoload: true });
db.movie = new Datastore({ filename: 'data/movie.nedb', autoload: true });
db.team = new Datastore({ filename: 'data/team.nedb', autoload: true });

/* GET home page. */
router.get('/', function(req, res, next) {
    var current_info = helpers.currentDraft();
    if (typeof current_info == 'object') {
        var selection_draft = current_info;
    }

    db['movie'].find( selection_draft ).sort({ release_date: 1 }).exec( function(err, movie_docs) {
        if (err) { console.log("Unable to get movie documents",err); process.exit(1); };

        // get the draft details as well
        db['draft'].findOne( selection_draft ).exec(function(err, draft_doc) {
            if (err) { console.log("Unable to get movie documents",err); process.exit(1); };

            var current_draft = {};
            current_draft.season= selection_draft.season;
            current_draft.year = selection_draft.year;
            current_draft.draft_start = draft_doc.draft_start;
            current_draft.draft_end = draft_doc.draft_end;
            current_draft.season_start = draft_doc.season_start;
            current_draft.season_end = draft_doc.season_end;

            db['team'].find( selection_draft ).exec(function(err, team_docs) {
                res.render('index', { title: 'IDX Movie Draft', movies: movie_docs, current_draft: current_draft, teams: team_docs });
            });
        });
    });
});

// team addtions page
router.get('/team/' + ':id', function(req, res, next) {
    var selection_draft = helpers.currentDraft();
    var team_id = req.params.id;

    db['movie'].find( selection_draft ).sort({ release_date: 1 }).exec( function(err, movie_docs) {
        db['team'].findOne({ _id: team_id }).sort({ release_date: 1 }).exec( function(err, team_doc) {
            if (team_doc === null) {
                var found = false;
                var title = "Team not found";
            }
            else {
                var found = true;
                var title = team_doc.team_name
            }
            res.render('team', {title: title, found: found, team: team_doc, movies: movie_docs });
        });
    });
});

// team addtions page
router.get('/add_team', function(req, res, next) {
    var current_draft = helpers.currentDraft();
    if (typeof current_draft == 'object') {
        var selection_draft = current_draft;
    }

    // create a bool to decide if required fields should be highlighted
    if (req.query.hasOwnProperty("required")) {
        var highlight_required = true;
    } else {
        var highlight_required = false;
    }

    res.render('add_team', {title: 'Add a drafting team', current_draft: selection_draft, highlight_required: highlight_required});
});

// add_team processor
router.post('/add_team', function(req, res, next) {
    var required = [
        req.body.team_name,
        req.body.member[0],
        req.body.member[1],
        req.body.member[2]
    ].forEach(function (elm) {
        if (typeof elm != "string" || elm.length == 0) {
            res.status(200).redirect("/add_team?required");
        }
    });

    // there's a number of steps we want to do in series
    async.waterfall([
        async.apply(makeID,req.body),
        checkName,
        translateMembers,
        insertTeam
    ],
    function (errs,final_res) {
        if (errs) { console.log("An error has occured ",errs); process.exit(1); } 

        if (typeof final_res == "object") {
            res.status(200).redirect("/");
        }
    });

    // make the teams ID and add it to the body
    function makeID (body, callback) {
        body._id = helpers.makeID([ body.season, body.year, body.team_name ]);

        if (typeof body._id != "string") {
            callback("Did not get string from makeID",null);
        }
        else {
            callback(null,body);
        }
    }

    // check to see if the name is taken
    function checkName (body, callback) {
        db['team'].count({ _id: body._id }).exec(function(err, count) {
            if (err) {
                callback(err,null);
            }
            else if (count !== 0) {
                callback("team name already exits",null);
            }
            else {
                callback(null,body);
            }
        })
    }

    // turn the members array into an object
    function translateMembers (body, callback) {
        // make the members into objects
        var members = [];
        for (var i = 0; i < 8; i++) {
            // remove empty elements
            if (typeof body.member[i] == 'string' && body.member[i].length != 0) {
                members.push( { _id: helpers.makeID(body.member[i]), name: body.member[i], movies: []} );
            }
        }
        body.member = members;
        callback(null,body);
    }

    // insert into the database
    function insertTeam(body, callback) {
        db['team'].insert(req.body, function(err) {
            if (err) { callback("Unable to insert into team db. "+err,null); process.exit(1); }
        });
            
        callback(null,body);
    }
});

module.exports = router;
