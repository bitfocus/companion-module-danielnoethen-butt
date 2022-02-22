const instance_skel = require('../../instance_skel')
const { exec } = require("child_process");

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

		this.actions() // export actions
	}

	updateCustomVariables = (variables) => {
		this.customVariables = variables
		this.actions()
	}

	updateConfig(config) {
		this.config = config

		// Set default values for server IP and port
		if (!this.config.server_ip) {
			this.config.server_ip = '127.0.0.1'
		}
		if (!this.config.server_port) {
			this.config.server_port = '1256'
		}
		this.debug('updateConfig', this.config)
		
		if (this.config.binary_path) {
			this.status(this.STATE_OK)
		} else {
			this.status(this.STATE_ERROR, 'No binary path set for BUTT')
		}

		this.actions()
	}

	init() {
		// Set default values for server IP and port
		if (!this.config.server_ip) {
			this.config.server_ip = '127.0.0.1'
		}
		if (!this.config.server_port) {
			this.config.server_port = '1256'
		}
		this.debug('init', this.config)

		if (this.config.binary_path) {
			this.status(this.STATE_OK)
		} else {
			this.status(this.STATE_ERROR, 'No binary path set for BUTT')
		}

		this.initFeedbacks()
		this.startStatusTimer()
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
					"BUTT should be installed and configured on the server.\nIt should also be configured to run the server component and listen on required network interfaces."
			},
			{
				type: 'textinput',
				id: 'binary_path',
				label: 'BUTT binary path on the server (either butt or butt-client binary)',
				width: 12,
				required: true
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
			}
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
		required: true
	}

	actions() {
		this.setActions({
			start_streaming: {
				label: 'Start streaming'
			},
			stop_streaming: {
				label: 'Stop streaming'
			},
			toggle_streaming: {
				label: 'Toggle streaming'
			},
			start_recording: {
				label: 'Start recording'
			},
			stop_recording: {
				label: 'Stop recording'
			},
			toggle_recording: {
				label: 'Toggle recording'
			},
			split_recording: {
				label: 'Split recording'
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
						required: true
					}
				]
			}
		})
	}

	invoke_binary = (args, callback) => {
		let cmd = `${this.config.binary_path} -a ${this.config.server_ip} -p ${this.config.server_port} ${args.join(' ')}`
		this.debug('invoke_binary', cmd)

		exec(cmd, (error, stdout, stderr) => {
			if (error) {
				this.log('error', `exec error: ${error}, sdterr: ${stderr}, stdout: ${stdout}`)
			} else {
				this.log('debug', `exec success, stdout: ${stdout}`)
				if (callback) {
					callback(stdout)
				}
			}
		});
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
			if (this.status.connected == '1' || this.status.connecting == '1') {
				matchedArgs = args.stop_streaming
			} else {
				matchedArgs = args.start_streaming
			}
		} else if (action.action == 'toggle_recording') {
			if (this.status.recording == '1') {
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
		this.statusTimer = setInterval(() => {
			this.invoke_binary(['-S'], (output) => {
				this.processStatus(output)
				this.checkFeedbacks()
			})
		}, 1000)
	}

	processStatus(output) {
		let lines = output.split('\n')
		let status = {}
		lines.forEach(line => {
			let [key, value] = line.split(':')
			if (key) {
				if (value) {
					status[key] = value.trim()
				}
				else {
					status[key] = ''
				}
			}
		})
		this.status = status
		this.debug('processStatus', status)
	}

	stopStatusTimer() {
		clearInterval(this.statusTimer)
	}

	initFeedbacks() {
		var feedbacks = {}
		feedbacks['streaming_connected_status'] = {
			type: 'boolean',
			label: 'Change colors based on streaming connected status',
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0)
			}
		}
		feedbacks['streaming_connecting_status'] = {
			type: 'boolean',
			label: 'Change colors based on streaming connecting status',
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 255, 0)
			}
		}
		feedbacks['recording_status'] = {
			type: 'boolean',
			label: 'Change colors based on recording status',
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0)
			}
		}
		feedbacks['signal_presence_status'] = {
			type: 'boolean',
			label: 'Change colors based on signal presence status',
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0)
			}
		}
		feedbacks['signal_transition_status'] = {
			type: 'boolean',
			label: 'Change colors based on signal transition status',
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 255, 0)
			}
		}
		this.setFeedbackDefinitions(feedbacks)
	}

	feedback(feedback) {
		switch(feedback.type) {
			case 'streaming_connected_status':
				return this.status.connected == '1'
			case 'streaming_connecting_status':
				return this.status.connecting == '1'
			case 'recording_status':
				return this.status.recording == '1'
			case 'signal_presence_status':
				return this.status['signal present'] == '1'
			case 'signal_transition_status':
				return this.status['signal present'] == '0' && this.status['signal absent'] == '0'
		}
	}
}
exports = module.exports = instance
