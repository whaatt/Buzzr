// hacky fix to prevent weird button
$(document).bind('mobileinit', function () {
	$.mobile.activeBtnClass = 'unused';
});

$(document).ready(function() {
	
	// hide gameview by default
	// this is a hack for some phones
	$('#gameview').hide();
	
	// create global connection
	var socket = io.connect('http://whaatt-server.nodejitsu.com');
	
	// global vars
	var room;
	var name;
	var admin;
	var team;
	var users;
	var buzzer;
	var myid;
	var locked;
	
	// form submit handler
	$('form#config').submit(function(e){
		e.preventDefault();
		socket.emit('connect', {'name' : $('#name').val(), 'room' : $('#room').val()}); //connect command
		$('.ui-btn-active').removeClass('ui-btn-active'); //hacky fix
		return false; // more preventing default
	});

	// bind to team select change
	// emit change to server
	$('#teamchoice').change(function(){
		socket.emit('team', {'color' : this.value});
	});
	
	// bind to buzz click for emit
	$('#buzzbutton').click(function(){
		socket.emit('buzz', {});
	});
	
	// bind to clear click for emit
	$('#clearbutton').click(function(){
		socket.emit('clear', {});
	});
	
	// bind to reset click for emit
	$('#resetbutton').click(function(){
		socket.emit('reset', {});
	});
	
	// handle connection
	socket.on('connect', function(){
		// change greeting to avoid carryover
		$('#greeting').html('Greetings, human. Please use the form below to enter or create a game. If your chosen game does not exist, it will be created for you. If the play button does not respond, the server may be down, so please try again later.');
	});
	
	// handle abrupt disconnects
	// do everything that a view state change does
	socket.on('disconnect', function(){
		$('#configview').show();
		$('#gameview').hide();
		$('#leave').remove();
		$('#head').trigger('create');
		$('#greeting').html('The server is currently having some trouble connecting. Please exit the app and try again. You may also simply wait; if this text changes then the server has reconnected with you. Thank you!');
		
		// reconnect after deleting socket above - NOT
		socket.socket.connect(); // hacky? necessary?
	});
	
	// server acknowledges connection with an error
	socket.on('error', function(data){
		$('#greeting').html(data.message);
	});
	
	// server acknowledges connection with an error
	socket.on('identify', function(data){
		
		// leave stuff
		$('#head').append('<a id="leave" data-role="button" data-icon="arrow-l" data-iconshadow="false" class="ui-btn-left">Leave</a>');
		$('#head').trigger('create');
		
		// bind to leave click after create
		// change views appropriately or refresh
		$('#leave').click(function(){
			//document.location.reload();
			socket.emit('leave', {});
			$('#configview').show();
			$('#gameview').hide();
			$('#leave').remove();
			$('#head').trigger('create');
		});
		
		// avoid carry over crap from old rooms
		$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here'); //hacky, for jquery mobile
		
		// change view
		$('#configview').hide();
		$('#gameview').show();
		
		// save ident info
		room = data.room;
		name = data.name;
		admin = data.admin;
		team = data.team;
		users = data.people;
		buzzer = data.current.playerID;
		myid = data.id;
		locked = false;
		
		// update html fields
		$('#room .ui-btn-text').text('Room ' + room); //hacky, for jquery mobile
		updateTeam();
		updateRoomConfig(); // fill in room collapsible
		
		// if status is buzzed
		// make it clear
		if (buzzer){
			$('#buzzbutton').button('disable');
			$('#buzzbutton').text(users[buzzer].name);
			$('#buzzbutton').button('refresh');
		}
		
		// if status is not buzzed
		// no carryover effects should occur
		else{
			$('#buzzbutton').button('enable');
			$('#buzzbutton').text('Buzz!!');
			$('#buzzbutton').button('refresh');
		}
		
		// if not admin, disable reset and clear
		if (admin == 0){
			$('#clearbutton').button('disable');
			$('#clearbutton').button('refresh');
			$('#resetbutton').button('disable');
			$('#resetbutton').button('refresh');
		}
		
		// if admin, enable reset to avoid carryover bug
		else{
			$('#resetbutton').button('enable');
			$('#resetbutton').button('refresh');
		}
		
		// if not buzzed, disable clear
		if (!buzzer){
			$('#clearbutton').button('disable');
			$('#clearbutton').button('refresh');
		}
		
		// make sure lists are collapsed
		$('.ui-collapsible').trigger('collapse');
		
		// fill in user list
		// update team against carryover
		updateUsers();
		updateTeam();
	});
	
	// joined event handler
	socket.on('joined', function(data){
		users[data[0]] = data[1]; // add user to list
		updateUsers(); // refresh user list
		$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (' + data[1].name + ' Just Joined)'); //hacky, for jquery mobile
	});
	
	// elevated event handler
	socket.on('elevated', function(data){
		if (data.playerID != myid){
			users[data.playerID].admin = 1; // make user an admin
			updateUsers(); // refresh user list
			$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (' + users[data.playerID].name + ' Just Got Admin)'); //hacky, for jquery mobile
		}
		
		else{ // you got admin!
			admin = 1; // set admin variable
			
			// button access
			$('#resetbutton').button('enable');
			
			if (buzzer){
				$('#clearbutton').button('enable');
			}
			
			// let you know about the good news
			$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (You Are Now Admin)'); //hacky, for jquery mobile
		}
	});
	
	// team change event handler
	socket.on('teammate', function(data){
		if (data.playerID != myid){ // someone else
			users[data.playerID].team = data.color; // set team color
			updateUsers(); // refresh user list
			$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (' + users[data.playerID].name + ' Changed Teams)'); //hacky, for jquery mobile
		}
		
		else{ // you changed
			team = data.color; // set new team color
			updateTeam(); // update select, just in case
		}
	});
	
	// buzzed event handler
	socket.on('buzzed', function(data){
		buzzer = data.playerID; // set buzzer
		$('#buzzbutton').button('disable'); // disable buzz button
		
		if (data.playerID != myid){ // if not self
			$('#buzzbutton').text(users[buzzer].name); // set buzz button text to buzzer
		}
		
		$('#buzzbutton').button('refresh'); // refresh buzz button
	});
	
	// admin can-clear handler
	socket.on('canclear', function(data){
		$('#clearbutton').button('enable');
	});
	
	// buzzer lockout handler
	socket.on('locked', function(data){
		locked = true; // set lock status
		updateRoomConfig(); // update visual display
	});
	
	// buzzer clear handler
	socket.on('cleared', function(data){
		if (!locked){
			$('#buzzbutton').button('enable'); // enable buzz if not locked out
		}
		
		buzzer = ''; // remove buzzer
		$('#buzzbutton').text('Buzz!!'); // set buzz button text to Buzz
		$('#buzzbutton').button('refresh'); // refresh buzz button
		$('#clearbutton').button('disable'); // disable clear button
		
		// communicate clear
		$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (Game Cleared)'); //hacky, for jquery mobile
	});
	
	// buzzer reset handler
	socket.on('resetted', function(data){
		buzzer = ''; // reset buzzer
		locked = false; // unlock
		updateRoomConfig(); // display this
		
		$('#buzzbutton').text('Buzz!!'); // set buzz button text to Buzz
		$('#buzzbutton').button('refresh'); // refresh buzz button
		
		//disable clear, enable buzz
		$('#buzzbutton').button('enable');
		$('#clearbutton').button('disable');
		
		$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (Buzzer System Reset)'); //hacky, for jquery mobile
	});

	// leaving event handler
	socket.on('leaving', function(data){
		// hacky async sanity check
		if (!data.playerID || !users[data.playerID]){
			return false;
		}
		
		$('#whoshere #whosheretext .ui-btn-text').text('Who\'s Here (' + users[data.playerID].name + ' Just Left)'); //hacky, for jquery mobile
		delete users[data.playerID]; // remove user from list
		updateUsers(); // refresh user list display
	});
	
	// update the who's here thing
	// data-theme corresponds to team using getDataTheme()
	function updateUsers(){
		// get users
		list = users;
		
		// data has elements check
		var has = false;
		
		$('#userlist').html('')
		for (var ID in list){
			has = true; // it has elements!
			
			// set check disabling or not based on client adminship or prechecked
			var disabled = admin == 0 || list[ID].admin == 1 ? 'disabled = "disabled"' : '';
			
			// set admin or user explicit text
			var adminText = list[ID].admin == 1 ? '(Admin)' : '(User)';
			
			var checked = list[ID].admin == 1 ? 'checked = "checked"' : ''; // set text for checking or not
			$('#userlist').append('<input data-theme="' + getDataTheme(list[ID].team) + '" type="checkbox" name="' + ID + '" id="' + ID + '" class="custom check" ' + checked + ' ' + disabled + '/><label for="' + ID + '">' + list[ID].name + ' ' + adminText + '</label>');
		}
		
		// elevate checkbox handler
		// bind to checkbox change
	
		$('input:checkbox').change(function(){
			socket.emit('elevate', {'playerID' : $(this).attr('id')});
			this.checkboxradio('disable');
		});
		
		// Add filler message
		if (!has){
			$('#userlist').append('No other users in this room! Sort of lonely.');
		}
		
		// refresh themes
		$('#lvw').trigger('create');
	}
	
	// update room config
	function updateRoomConfig(){
		$('#yourname').html(name);
		$('#adminstatus').html(admin == 1 ? 'Yes' : 'No');
		$('#lockedout').html(locked == true ? 'Yes' : 'No');
	}
	
	// update team
	function updateTeam(){
		// select the relevant option, de-select any others
		$('#teamchoice').val(team).attr('selected', true).siblings('option').removeAttr('selected');
		$('#teamchoice').selectmenu('refresh', true); // jquery mobile crap
	}
	
	// get data-theme value by team color
	function getDataTheme(color){
		if (color == 'white'){
			return 'a';
		}
		
		else if (color == 'red'){
			return 'b';
		}
		
		else if (color == 'green'){
			return 'c';
		}
		
		else if (color == 'orange'){
			return 'd';
		}
		
		else if (color == 'blue'){
			return 'e';
		}
		
		else{
			return false;
		}
	}
	
	
});