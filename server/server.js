// define client array
// define buzzed array
// create connection

var io = require('socket.io').listen(80),
	players = new Object();
	sockets = new Object();
	buzzrooms = new Object();
	//games = new Object();
	
// set log level - warnings only
// set transport types - WS with xhr fallback

io.set('log level', 1);

// flashsocket?
// io.set('transports', [ 'websocket', 'xhr-polling' ]);
// io.set('transports', [ 'xhr-polling' ]);

// socket.io processes events through this
// for each, check if data is valid as necessary
io.sockets.on('connection', function(socket){

	// event sent after first connection
	socket.on('connect', function(data){
		connect(socket, data);
	});
	
	// user tries to get admin privs
	socket.on('elevate', function(data){
		elevate(socket, data);
	});
	
	// user tries to change team
	socket.on('team', function(data){
		team(socket, data);
	});
	
	// user tries to buzz in
	socket.on('buzz', function(data){
		buzz(socket, data);
	});
	
	// admin user tries to clear buzz
	socket.on('clear', function(data){
		clear(socket, data);
	});
	
	// admin user tries to reset buzzers
	socket.on('reset', function(data){
		reset(socket, data);
	});
	
	// user tries to leave the room
	socket.on('leave', function(data){
		leave(socket, data);
	});
	
	// user disconnects somehow
	socket.on('disconnect', function(){
		disconnect(socket);
	});

});

// handle connect event
function connect(socket, data){

	// emit errors
	// as necessary
	
	// already exists
	if ((socket.id in players) || (socket.id in sockets)){
		return false; // die gracefully
	}
	
	// malformed both
	if (!('name' in data) && !('room' in data)){
		socket.emit('error', {'message' : 'You did not fill anything in. Please try again.'});
		return false; // die gracefully
	}
	
	// malformed name
	if (!('name' in data)){
		socket.emit('error', {'message' : 'No nickname provided. Please try again.'});
		return false; // die gracefully
	}
	
	// malformed room
	if (!('room' in data)){
		socket.emit('error', {'message' : 'No room name provided. Please try again.'});
		return false; // die gracefully
	}
	
	// save socket by ID
	sockets[socket.id] = socket;
	
	// truncate nickname and room name to 10 chars
	data.name = data.name.substring(0, 10);
	data.room = data.room.substring(0, 10);
	data.admin = 0; // assign admin status
	data.locked = false; // assign locked status
	data.team = 'white'; // assign individual
	data.id = socket.id // save id for client
	
	// save name and room to socket
	players[socket.id] = data;
	
	// log name and room to socket
	console.log(data.name + ' joined room ' + data.room + '.');
	
	var roomPlayers = new Object();
	playerIDs = io.sockets.manager.rooms['/' + data.room];

	// deal with null array
	if (typeof playerIDs == 'undefined'){
		playerIDs = [];
	}
	
	if (playerIDs.length == 0){ // only player in room
		players[socket.id].admin = 1; // elevate
	}
	
	else{ // previously existing room
		// check if name is duplicated, disallow this
		for (var i = 0; i < playerIDs.length; i++){
			if (players[playerIDs[i]].name == data.name){ // if same name
				socket.emit('error', {'message' : 'Name already in use. If you do not think this is correct, it may be because you disconnected without pressing leave. Please wait a little while for the server to recognize the lost connection, then try again, or simply select a different name.'});
				delete players[socket.id]; // we already put the user in
				delete sockets[socket.id]; // same deal
				return false; // die gracefully
			}
		}
	
		io.sockets.in(data.room).emit('joined', [socket.id, data]); // communicate join
		
		// build array of player info
		for (var i = 0; i < playerIDs.length; i++){
			if (playerIDs[i] != socket.id){ // if not self
				roomPlayers[playerIDs[i]] = JSON.parse(JSON.stringify(players[playerIDs[i]])); // add info to array, see note below
			}
		}
	}
	
	// put socket in room
	socket.join(data.room);
	
	// add roomPlayers to newData array
	newData = JSON.parse(JSON.stringify(data)); // hacky
	newData.people = roomPlayers; // don't save in data
	
	// if room is currently buzzed then notify in identify
	if (buzzrooms[data.room]){
		newData.current = buzzrooms[data.room];
	}
	
	// otherwise, notify nothing
	else{
		newData.current = '';
	}
	
	// communicate name, room, admin status, users, etc...
	socket.emit('identify', newData);
	
	// exit gracefully
	return true;
}

// handle elevate event
function elevate(socket, data){
	
	// gotta connect 'em all first
	if (!(socket.id in players) || !(socket.id in sockets)){
		return false; // die gracefully
	}
	
	// malformed playerID
	if (!('playerID' in data) || !(data.playerID in players) || !(data.playerID in sockets)){
		return false // die gracefully
	}
	
	// no error message for unelevated or not in room or not same room
	if (players[socket.id].admin != 1 || 
		!players[socket.id].room ||
		!players[data.playerID].room ||
		players[socket.id].room != players[data.playerID].room ||
		socket.id == data.playerID){
		return false;
	}
	
	// first do elevation
	players[data.playerID].admin = 1;
	
	// communicate elevated status to player OR > just broadcast
	io.sockets.in(players[socket.id].room).emit('elevated', {'playerID' : data.playerID});
	
	// log name and room to socket
	console.log(players[data.playerID].name + ' was elevated in room ' + players[data.playerID].room + '.');
	
	// exit gracefully
	return true;
	
}

// handle team event
function team(socket, data){

	// gotta connect 'em all first
	if (!(socket.id in players) || !(socket.id in sockets)){
		return false; // die gracefully
	}

	// malformed color
	if (!('color' in data)){
		return false // die gracefully
	}
	
	var colors = ['white', 'green', 'orange', 'blue', 'red'];
	
	// check if color is valid
	if (colors.indexOf(data.color) == -1){
		return false;
	}
	
	// check if user is in a room
	if (!players[socket.id].room){
		return false;
	}
	
	// actually set the player's color
	players[socket.id].team = data.color;
	
	// communicate change in color through broadcast
	io.sockets.in(players[socket.id].room).emit('teammate', {'playerID' : socket.id, 'color' : data.color});
	
	// log name and room to socket
	console.log(players[socket.id].name + ' joined team ' + data.color + ' in room ' + players[socket.id].room + '.');
	
	// exit gracefully
	return true;

}

// handle buzz event
function buzz(socket, data){

	// gotta connect 'em all first
	if (!(socket.id in players) || !(socket.id in sockets)){
		return false; // die gracefully
	}

	// check if user is in a room
	if (!players[socket.id].room){
		return false;
	}
	
	// check if user is locked out
	if (players[socket.id].locked){
		return false;
	}
	
	// check if room is buzzed already
	if (buzzrooms[players[socket.id].room]){
		return false;
	}
	
	// communicate buzz through broadcast, register buzz
	io.sockets.in(players[socket.id].room).emit('buzzed', {'playerID' : socket.id});
	buzzrooms[players[socket.id].room] = {'playerID' : socket.id};
	
	// get list of all players to filter for admins
	playerIDs = io.sockets.manager.rooms['/' + players[socket.id].room];
	
	// deal with null array
	if (typeof playerIDs == 'undefined'){
		playerIDs = [];
	}
	
	for (var i = 0; i < playerIDs.length; i++){
		if (players[playerIDs[i]].admin == 1){ // if admin
			sockets[playerIDs[i]].emit('canclear', {}); // allow clear
		}
	}
	
	// log name and room to socket
	console.log(players[socket.id].name + ' (' + players[socket.id].team + ') buzzed in room ' + players[socket.id].room + '.');
	
	// exit gracefully
	return true;

}

// handle clear event
function clear(socket, data){

	// gotta connect 'em all first
	if (!(socket.id in players) || !(socket.id in sockets)){
		return false; // die gracefully
	}

	// check if user is in a room
	if (!players[socket.id].room){
		return false;
	}

	// check if user is elevated
	if (!players[socket.id].admin){
		return false;
	}
	
	// check if gameplay buzzed
	if (!buzzrooms[players[socket.id].room]){
		return false;
	}
	
	// get original buzzer's team with this mess
	var buzzedPlayerID = buzzrooms[players[socket.id].room].playerID
	var team = players[buzzedPlayerID].team;
	
	// individual lockout
	if (team == 'white'){
		players[buzzedPlayerID].locked = true;
		
		// make sure we are emitting to a player that still exists
		if (buzzedPlayerID in sockets){
			sockets[buzzedPlayerID].emit('locked', {});
		}
	}
	
	// team lockout
	else{
		playerIDs = io.sockets.manager.rooms['/' + players[socket.id].room];
	
		// deal with null array
		if (typeof playerIDs == 'undefined'){
			playerIDs = [];
		}
		
		for (var i = 0; i < playerIDs.length; i++){
			if (players[playerIDs[i]].team == team && sockets[playerIDs[i]]){ // if on given team and exists at all
				players[playerIDs[i]].locked = true; // lockout
				sockets[playerIDs[i]].emit('locked', {}); // say lockout
			}
		}
	}
	
	// the stuff below is for the disconnect quirk
	playerIDs = io.sockets.manager.rooms['/' + players[socket.id].room];
	
	// deal with null array
	if (typeof playerIDs == 'undefined'){
		playerIDs = [];
	}
	
	// disconnect quirk
	for (var key in players){
		if (playerIDs.indexOf(key) == -1 && players[key].room == players[socket.id].room){
			delete players[key];
		}
	}
	
	// delete buzz and broadcast clear
	delete buzzrooms[players[socket.id].room];
	io.sockets.in(players[socket.id].room).emit('cleared', {});
	
	
	// log name and room to socket
	console.log('Room ' + players[socket.id].room + '  was just cleared.');
	
	// exit gracefully
	return true;
	
}

// handle reset event
function reset(socket, data){

	// gotta connect 'em all first
	if (!(socket.id in players) || !(socket.id in sockets)){
		return false; // die gracefully
	}

	// check if user is in a room
	if (!players[socket.id].room){
		return false;
	}

	// check if user is elevated
	if (!players[socket.id].admin){
		return false;
	}
	
	// resetting magic, delete from buzzrooms
	delete buzzrooms[players[socket.id].room];
	
	// more resetting magic, now reset lock statuses
	playerIDs = io.sockets.manager.rooms['/' + players[socket.id].room];
	
	// deal with null array
	if (typeof playerIDs == 'undefined'){
		playerIDs = [];
	}
	
	for (var i = 0; i < playerIDs.length; i++){
		players[playerIDs[i]].locked = false; // unlockout
	}
	
	// disconnect quirk
	for (var key in players){
		if (playerIDs.indexOf(key) == -1 && players[key].room == players[socket.id].room){
			delete players[key];
		}
	}
	
	// finally, broadcast this stuff
	io.sockets.in(players[socket.id].room).emit('resetted', {});

	// log name and room to socket
	console.log('Room ' + players[socket.id].room + '  was just reset.');
	
	// exit gracefully
	return true;

}

// handle leave event
function leave(socket, data){
	
	// force disconnect
	socket.disconnect();
	
	// async sanity check
	if (!(socket.id in players)){ // || !players[socket.id]){
		return false;
	}
	
	// check if disconnect already called
	// and in turn called cleanup()
	if (!(socket.id in sockets)){
		return false;
	}
	
	// start cleanup
	cleanup(socket.id, players[socket.id].room);
	
	// exit gracefully
	return true;
	
}

// handle <disconnect> event
function disconnect(socket){
	
	// async sanity check
	if (!(socket.id in players)){
		return false;
	}
	
	// check if leave already called
	// and in turn called cleanup()
	if (!(socket.id in sockets)){
		return false;
	}
	
	// start cleanup
	cleanup(socket.id, players[socket.id].room);
	
	// exit gracefully
	return true;
	
}

// cleanup after disconnect
function cleanup(ID, room){

	// delete traces of player
	delete sockets[ID];
	
	// broadcast leaving
	io.sockets.in(room).emit('leaving', {'playerID' : ID});
	
	// if player was the only one in room, delete player
	playerIDs = io.sockets.manager.rooms['/' + room];
	
	// deal with null array
	if (typeof playerIDs == 'undefined'){
		playerIDs = [];
	}
	
	// log name and room to socket
	console.log(players[ID].name + ' just left room ' + players[ID].room + '.');
	
	// the second condition is some bastard fix here...whut
	if (playerIDs.length == 0 || (playerIDs.length == 1 && playerIDs[0] == ID)){
		// delete buzzroom if room is buzzed
		if (buzzrooms[players[ID].room]){
			delete buzzrooms[players[ID].room];
		}
		
		delete players[ID]; // delete from players
	}
	
	else{
		var adminCount = 0;
		
		// see if exiting player was last admin
		for (var i = 0; i < playerIDs.length; i++){
			if (ID != playerIDs[i] && players[playerIDs[i]].admin == 1){
				adminCount++;
			}
		}
		
		// exiting player will still be in players
		if (adminCount == 0){
			var exiting = playerIDs.indexOf(ID);
			
			// remove exiting player from playerIDs
			if (exiting != -1){
			   playerIDs.splice(exiting, 1);
			}
			
			// give some lucky random fellow the adminship for the room
			var randomPlayer = Math.floor(Math.random()*playerIDs.length);
			players[playerIDs[randomPlayer]].admin = 1;
			io.sockets.in(room).emit('elevated', {'playerID' : playerIDs[randomPlayer]}); // broadcast this
		}
	}
}