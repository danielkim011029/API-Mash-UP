/*
=-=-=-=-=-=-=-=-=-=-=-=-
FINAL PROJECT
=-=-=-=-=-=-=-=-=-=-=-=-
Student ID: 23646281
Comment (Required):
When server receives /search endpoint, it requests api request to random cat quotes api then
it calls pet finder api synchronously
=-=-=-=-=-=-=-=-=-=-=-=-
*/
const fs = require("fs");
const http = require("http");
const https = require("https");
const url = require("url");
const querystring = require("querystring");

const port = 3000;
const server = http.createServer();

server.on("listening", listen_handler);
server.listen(port);
function listen_handler(){
    console.log(`Now Listening on Port ${port}`);
}

server.on("request", request_handler);
function request_handler(req, res){
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);
    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
		res.writeHead(200, {"Content-Type": "text/html"})
		form.pipe(res);
    }
    else if (req.url.startsWith("/search")){
        let user_input = url.parse(req.url, true).query.type;
        
        //error handling
        if(user_input==""){
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.write("404 Not Found");
            res.end();
        }
        //start apis
        else{
		    random_catfact(user_input,res);
            res.writeHead(200, {"Content-Type": "text/html"});
        }
    }
    //error handling
    else{
        res.writeHead(404, { "Content-Type": "text/plain" });
		res.write("404 Not Found");
		res.end();
    }   
}
//catfact search
function random_catfact(user_input,res){
    const options={
        "method":"GET"
    }
    cat_endpoint="https://cat-fact.herokuapp.com/facts"
    search_req=https.request(cat_endpoint,options,function(search_res){
        received_catfact_search_results(search_res,user_input,res);
    });
    search_req.end();
}
//receive catfact search
function received_catfact_search_results(search_res,user_input,res){
    search_res.setEncoding("utf8");
    let body="";
    search_res.on("data",function(chunk) {body+=chunk;});
    search_res.on("end",function(){
        let search_results=JSON.parse(body);
        let random_fact=search_results.all[Math.floor(Math.random()*search_results.all.length)].text;
        random_fact = `<h1>Random Cat Fact:</h1>${random_fact}`;
        res.write(random_fact,function(){
            console.log("FINISHED CAT FACT");
            start_petfinder(user_input,res);
        });
    });
}

//check authentication
function start_petfinder(user_input,res){
    //checking cashe
    let cashe_valid=false;
    let cashed_auth;
    const authentication_cashe='./auth/authentication-res.json';
    //if cashed token exists
    if(fs.existsSync(authentication_cashe)){
        cashed_auth=require(authentication_cashe);
        //if cashed token is not expired 
        if(new Date(cashed_auth.expires_in)>Date.now()){
            cashe_valid=true;
        }
        //if cashed token is expired
        else{
            console.log('Token Expired');
        }
    }
    //if cashed token is valid go straight to search request
    if(cashe_valid){
        console.log("CASHED TOKEN");
        create_petfinder_search_request(cashed_auth,user_input,res); 
    }
    //else send token request
    else{
        send_access_token_request(user_input,res);
    }
}
//send access token
function send_access_token_request(user_input,res){
    const {grant_type,client_id,client_secret} = require("./auth/credentials.json");

    const headers={
        'Content-Type':'application/x-www-form-urlencoded',
    }

    const options={
        "method":"POST",
        "headers":headers
    }

    const token_endpoint = "https://api.petfinder.com/v2/oauth2/token";
    const post_data = querystring.stringify({grant_type,client_id,client_secret});
    let auth_sent_time=new Date();

    
    let authentication_request=https.request(token_endpoint,options,function(authentication_res){
    console.log("REQUESTING TOKEN");
    received_authentication(authentication_res,auth_sent_time,user_input,res);
    });
    authentication_request.end(post_data);
    
}
//receive access token
function received_authentication (authentication_res,auth_sent_time,user_input,res){
    let body = "";
    authentication_res.on("data", chunk => body += chunk);
    authentication_res.on("end",function(){
        let search_results=JSON.parse(body);
        //set expiration time
        const petfinder_auth_expiration=auth_sent_time;
        petfinder_auth_expiration.setHours(auth_sent_time.getHours()+1);
        search_results.expires_in=petfinder_auth_expiration;

        create_access_token_cashe(search_results);
        create_petfinder_search_request(search_results,user_input,res);
    });
}

//cashe token
function create_access_token_cashe(search_results){
    fs.writeFile('./auth/authentication-res.json',JSON.stringify(search_results),(err)=>{
        if(err) throw err;
    });
}

//send search request for pet finder
function create_petfinder_search_request(search_results,user_input,res){
    let query={
        "type":user_input
    }   
    query=querystring.stringify(query);

    const headers={
        "Authorization":search_results.token_type+" "+search_results.access_token
    }

    const options2={
        "method":"GET",
        "headers":headers
    }

    let search_endpoint="https://api.petfinder.com/v2/animals?"
    search_endpoint=search_endpoint+query;

    //checking search cashe
    const search_cashe='./cashe/'+user_input+'.json';
    if(fs.existsSync(search_cashe)){
        console.log("SERVING CASHED RESULTS");
        let cashed_search=require(search_cashe);
        serve_results(cashed_search,res);
    }
    else{
        search_request=https.request(search_endpoint,options2,function(search_res){
            received_petfinder_search_results(search_res,user_input,res);
            console.log("SERVING NEW RESULTS");
        });
        search_request.end();
   }
}
//receive search results for petfinder
function received_petfinder_search_results(search_res,user_input,res){
    search_res.setEncoding("utf8");
    let body="";
    search_res.on("data",function(chunk) {body+=chunk;});
    search_res.on("end",function(){
        let search_results=JSON.parse(body);

        //casheing searched results
        if(search_results.status!=400){
            cashe_results(user_input,search_results);
        }

        serve_results(search_results,res);
        
    });
}

//casheing petfinder results
function cashe_results(user_input,search_results){
    fs.writeFile('./cashe/'+user_input+'.json',JSON.stringify(search_results),(err)=>{
        if(err) throw err;
    });
}

//serve results for pet finder
function serve_results(search_results,res){
    let pet = search_results.animals;
    let results;
    //error handling
    if(pet==undefined){
        results = `<h1>Petfinder: No Results Found</h1>`
    }
    else{
        results = pet.map(formatJob).join('');
    }
        results = `<h1>PetFinder Results:</h1>${results}`
        res.write(results);
        res.end();
        console.log("PET FINDER FINISHED");
        function formatJob({name,url,gender,type,breeds}){
            return `<h2><a href="${url}">${name}</a></h2>Type:${type}, </a></h2>Breed:${breeds.primary}, </a></h2>Gender:${gender}`;
        }
    
}