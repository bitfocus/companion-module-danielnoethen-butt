const instance_skel = require('../../instance_skel')
const { exec } = require('child_process')
const fs = require('fs')

class instance extends instance_skel {
	/**
	 * Create an instance of the module
	 *
	 * @param {EventEmitter} system - the brains of the operation
	 * @param {string} id - the instance ID
	 * @param {Object} config - saved user configuration parameters
	 * @since 1.0.0
	 */
	constructor(system, id, config) {
		super(system, id, config)

		// Custom Variables Handling
		this.customVariables = {}
		system.emit('custom_variables_get', this.updateCustomVariables)
		system.on('custom_variables_update', this.updateCustomVariables)
	}

	updateCustomVariables = (variables) => {
		this.customVariables = variables
	}

	updateConfig(config) {
		this.config = config
		this.checkConfigAndStartTimer()
	}

	checkConfigAndStartTimer() {
		// Set default values for server IP and port
		if (!this.config.server_ip) {
			this.config.server_ip = '127.0.0.1'
		}
		if (!this.config.server_port) {
			this.config.server_port = 1256
		}
		if (!this.config.timer_interval) {
			this.config.timer_interval = 1000
		}
		this.debug('config', this.config)

		this.stopStatusTimer()
		if (this.config.binary_path) {
			fs.access(this.config.binary_path, fs.F_OK, (err) => {
				if (err) {
					this.status(this.STATE_ERROR, 'No BUTT binary found in the configured binary path')
				} else {
					this.status(this.STATE_OK, 'Configured binary path is valid')
					this.startStatusTimer()
				}
			})
		} else {
			this.status(this.STATE_ERROR, 'No binary path set for BUTT')
		}
	}

	init() {
		this.initActions()
		this.initVariables()
		this.initFeedbacks()
		this.initPresets()
		this.checkConfigAndStartTimer()
	}

	// Return config fields for web config
	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					'BUTT should be installed and configured on the server. ' +
					'It should also be configured to run the server component and ' +
					'listen on all network interfaces (command line argument -A). ' +
					'Minimum supported version is 0.1.33.',
			},
			{
				type: 'textinput',
				id: 'binary_path',
				label: 'BUTT binary path on the server (either butt or butt-client binary)',
				width: 12,
				required: true,
			},
			{
				type: 'textinput',
				id: 'server_ip',
				label: 'IP address of the server (default: 127.0.0.1)',
				default: '127.0.0.1',
				width: 12,
			},
			{
				type: 'number',
				id: 'server_port',
				label: 'Port of the server (default: 1256)',
				min: 1,
				max: 65535,
				default: 1256,
				width: 12,
			},
			{
				type: 'number',
				id: 'timer_interval',
				label: '[Advanced] Status timer interval (default: 1000ms)',
				min: 100,
				max: 60000,
				default: 1000,
				width: 12,
			},
		]
	}

	// When module gets deleted
	destroy() {
		this.debug('destroy')
		this.system.removeListener('custom_variables_update', this.updateCustomVariables)
		this.stopStatusTimer()
	}

	FIELD_THRESHOLD = {
		type: 'number',
		label: 'Seconds',
		id: 'threshold',
		min: 0,
		max: 1000,
		required: true,
	}

	initActions() {
		let actions = {
			start_streaming: {
				label: 'Start streaming',
			},
			stop_streaming: {
				label: 'Stop streaming',
			},
			toggle_streaming: {
				label: 'Toggle streaming',
			},
			start_recording: {
				label: 'Start recording',
			},
			stop_recording: {
				label: 'Stop recording',
			},
			toggle_recording: {
				label: 'Toggle recording',
			},
			split_recording: {
				label: 'Split recording',
			},
			set_streaming_signal_threshold: {
				label: 'Set streaming signal threshold',
				options: [this.FIELD_THRESHOLD],
			},
			set_streaming_silence_threshold: {
				label: 'Set streaming silence threshold',
				options: [this.FIELD_THRESHOLD],
			},
			set_recording_signal_threshold: {
				label: 'Set recording signal threshold',
				options: [this.FIELD_THRESHOLD],
			},
			set_recording_silence_threshold: {
				label: 'Set recording silence threshold',
				options: [this.FIELD_THRESHOLD],
			},
			update_song_name: {
				label: 'Update song name',
				options: [
					{
						type: 'textinput',
						label: 'Song name',
						id: 'song_name',
						required: true,
					},
				],
			},
		}
		this.setActions(actions)
	}

	invoke_binary = (args, success, failure) => {
		let cmd = `${this.config.binary_path} -a ${this.config.server_ip} -p ${this.config.server_port} ${args.join(' ')}`
		this.debug('invoke_binary', cmd)

		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				this.log('error', `exec error: ${error}, sdterr: ${stderr}, stdout: ${stdout}`)
				if (failure) {
					failure(stdout)
				}
			} else {
				this.debug(`exec success, stdout: ${stdout}`)
				if (success) {
					success(stdout)
				}
			}
		})
	}

	action(action) {
		let args = {
			start_streaming: ['-s'],
			stop_streaming: ['-d'],
			start_recording: ['-r'],
			stop_recording: ['-t'],
			split_recording: ['-n'],
			set_streaming_signal_threshold: ['-M', action.options.threshold],
			set_streaming_silence_threshold: ['-m', action.options.threshold],
			set_recording_signal_threshold: ['-O', action.options.threshold],
			set_recording_silence_threshold: ['-o', action.options.threshold],
			update_song_name: ['-u', `"${action.options.song_name}"`],
		}

		var matchedArgs = []
		if (action.action == 'toggle_streaming') {
			if (this.serverStatus.connected == '1' || this.serverStatus.connecting == '1') {
				matchedArgs = args.stop_streaming
			} else {
				matchedArgs = args.start_streaming
			}
		} else if (action.action == 'toggle_recording') {
			if (this.serverStatus.recording == '1') {
				matchedArgs = args.stop_recording
			} else {
				matchedArgs = args.start_recording
			}
		} else {
			matchedArgs = args[action.action]
		}

		this.invoke_binary(matchedArgs)
	}

	startStatusTimer() {
		this.ticks = 0
		this.statusTimer = setInterval(() => {
			this.invoke_binary(
				['-S'],
				(output) => {
					// success
					this.status(this.STATE_OK, output)
					this.processStatus(output)
					this.checkFeedbacks()
					this.ticks++
				},
				(output) => {
					// failure
					this.status(
						this.STATE_ERROR,
						'Error while getting status, make sure BUTT server is running on the configured IP/port or restart it manually. Output: ' +
							output
					)
					this.processStatus('')
					this.checkFeedbacks()
				}
			)
		}, this.config.timer_interval)
		this.log('debug', 'BUTT status timer started')
	}

	processStatus(output) {
		let lines = output.split('\n')
		let status = {}
		lines.forEach((line) => {
			let [key, value] = line.split(':')
			if (key) {
				status[key] = value ? value.trim() : ''
			}
		})
		this.setVariables(status)
		this.serverStatus = status
		this.debug('processStatus', status)
	}

	stopStatusTimer() {
		if (this.statusTimer) {
			clearInterval(this.statusTimer)
		}
	}

	initVariables() {
		this.setVariableDefinitions([
			{
				label: 'Active song name being streamed',
				name: 'stream_song_name',
			},
			{
				label: 'Short active song name being streamed',
				name: 'stream_song_name_short',
			},
			{
				label: 'Active file name being recorded to',
				name: 'recording_file_name',
			},
			{
				label: 'Short active file name being recorded to',
				name: 'recording_file_name_short',
			},
			{
				label: 'Duration of the active stream (seconds)',
				name: 'stream_duration',
			},
			{
				label: 'Duration of the active stream (hh:mm:ss)',
				name: 'stream_duration_hhmmss',
			},
			{
				label: 'Duration of the active recording (seconds)',
				name: 'recording_duration',
			},
			{
				label: 'Duration of the active recording (hh:mm:ss)',
				name: 'recording_duration_hhmmss',
			},
			{
				label: 'Total amount of data sent for the active stream (kBytes)',
				name: 'stream_data_sent',
			},
			{
				label: 'Total amount of data saved for the active recording (kBytes)',
				name: 'recording_data_saved',
			},
		])
	}

	extractShortString(str, maxLength) {
		if (!str) {
			return ''
		}
		if (str.length > maxLength) {
			let start = this.ticks % str.length
			return str.substring(start, start + maxLength)
		}
		return str
	}

	secondsToHhMmSs(seconds) {
		if (!seconds) {
			return '00:00:00'
		}
		let hh = Math.floor(seconds / 3600)
		let mm = Math.floor((seconds % 3600) / 60)
		let ss = Math.floor((seconds % 3600) % 60)
		return `${hh}:${mm < 10 ? '0' + mm : mm}:${ss < 10 ? '0' + ss : ss}`
	}

	setVariables(status) {
		this.setVariable('stream_song_name', status['song'])
		this.setVariable('stream_song_name_short', this.extractShortString(status['song'], 9))
		this.setVariable('recording_file_name', 'Not implemented')
		this.setVariable('recording_file_name_short', this.extractShortString('Not implemented', 9))
		this.setVariable('stream_duration', status['stream time'])
		this.setVariable('stream_duration_hhmmss', this.secondsToHhMmSs(status['stream time']))
		this.setVariable('recording_duration', status['record time'])
		this.setVariable('recording_duration_hhmmss', this.secondsToHhMmSs(status['record time']))
		this.setVariable('stream_data_sent', status['stream kBytes'])
		this.setVariable('recording_data_saved', status['record kBytes'])
	}

	initFeedbacks() {
		let feedbacks = {
			streaming_connected_status: {
				type: 'boolean',
				label: 'Streaming connected status',
				style: {
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(0, 255, 0),
				},
			},
			streaming_connecting_status: {
				type: 'boolean',
				label: 'Streaming connecting status',
				style: {
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(255, 255, 0),
				},
			},
			recording_status: {
				type: 'boolean',
				label: 'Recording status',
				style: {
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(0, 255, 0),
				},
			},
			signal_presence_status: {
				type: 'boolean',
				label: 'Signal presence status',
				style: {
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(0, 255, 0),
				},
			},
			signal_transition_status: {
				type: 'boolean',
				label: 'Signal transition status',
				style: {
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(255, 255, 0),
				},
			},
			error_status: {
				type: 'boolean',
				label: 'Error status',
				style: {
					color: this.rgb(0, 0, 0),
					bgcolor: this.rgb(255, 0, 0),
					text: 'ERR',
					size: 'auto',
					alignment: 'center:center',
				},
			},
		}
		feedbacks['error_status'] = {
			type: 'boolean',
			label: 'Error status',
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
				text: 'ERR',
				size: 'auto',
				alignment: 'center:center',
			},
		}
		this.setFeedbackDefinitions(feedbacks)
	}

	feedback(feedback) {
		switch (feedback.type) {
			case 'streaming_connected_status':
				return this.serverStatus.connected == '1'
			case 'streaming_connecting_status':
				return this.serverStatus.connecting == '1'
			case 'recording_status':
				return this.serverStatus.recording == '1'
			case 'signal_presence_status':
				return this.serverStatus['signal present'] == '1'
			case 'signal_transition_status':
				return this.serverStatus['signal present'] == '0' && this.serverStatus['signal absent'] == '0'
			case 'error_status':
				return Object.keys(this.serverStatus).length == 0 // activate if empty
		}
	}

	initPresets() {
		let presets = [
			{
				category: 'Commands',
				label: 'Toggle streaming',
				bank: {
					style: 'text',
					text: 'Stream',
					size: '18',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'set_streaming_signal_threshold',
						delay: 0,
						options: {
							threshold: 0,
						},
					},
					{
						action: 'set_streaming_silence_threshold',
						delay: 500,
						options: {
							threshold: 0,
						},
					},
					{
						action: 'toggle_streaming',
						delay: 1500,
						options: {},
					},
				],
				feedbacks: [
					{
						type: 'streaming_connecting_status',
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 255, 0),
						},
					},
					{
						type: 'streaming_connected_status',
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(0, 255, 0),
						},
					},
				],
			},
			{
				category: 'Commands',
				label: 'Toggle recording',
				bank: {
					style: 'text',
					text: 'Record',
					size: '18',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				actions: [
					{
						action: 'set_recording_signal_threshold',
						delay: 0,
						options: {
							threshold: 0,
						},
					},
					{
						action: 'set_recording_silence_threshold',
						delay: 500,
						options: {
							threshold: 0,
						},
					},
					{
						action: 'toggle_recording',
						delay: 1500,
						options: {},
					},
				],
				feedbacks: [
					{
						type: 'recording_status',
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(0, 255, 0),
						},
					},
				],
			},
			{
				category: 'Commands',
				label: 'Toggle signal presence',
				bank: {
					style: 'text',
					text: 'Signal',
					size: '18',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				feedbacks: [
					{
						type: 'signal_transition_status',
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 255, 0),
						},
					},
					{
						type: 'signal_presence_status',
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(0, 255, 0),
						},
					},
					{
						type: 'error_status',
						style: {
							color: this.rgb(0, 0, 0),
							bgcolor: this.rgb(255, 0, 0),
							text: 'ERR',
							size: 'auto',
							alignment: 'center:center',
						},
					},
				],
			},
		]
		this.setPresetDefinitions(presets)
	}
}
exports = module.exports = instance
