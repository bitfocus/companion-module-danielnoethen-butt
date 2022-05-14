const instance_skel = require('../../instance_skel')
const ButtClient = require('buttjs')

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
		if (!this.config.scrolling_text_max_length) {
			this.config.scrolling_text_max_length = 9
		}
		this.debug('config', this.config)

		this.stopStatusTimer()
		this.buttClient = new ButtClient(this.config.server_ip, this.config.server_port)
		this.status(this.STATE_OK, 'Loaded configuration successfully')
		this.startStatusTimer()
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
					'See BUTT version support in the module HELP. Recommended version is 0.1.34.',
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
				id: 'scrolling_text_max_length',
				label: 'Maximum length of the scrolling text for all variables ending in "_short" (default: 9)',
				min: 1,
				max: 100,
				default: 9,
				width: 12,
			},
			{
				type: 'number',
				id: 'timer_interval',
				label: '[Advanced] Status timer interval in milliseconds (default: 1000)',
				min: 1000,
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

	buttCallback = (err, _) => {
		if (err) {
			this.log('error', 'BUTT error: ' + err)
		} else {
			this.debug('BUTT success')
		}
	}

	action(action) {
		if (action.action == 'toggle_streaming') {
			if (this.serverStatus.connected || this.serverStatus.connecting) {
				this.buttClient.stopStreaming(this.buttCallback)
			} else {
				this.buttClient.startStreaming(this.buttCallback)
			}
		} else if (action.action == 'toggle_recording') {
			if (this.serverStatus.recording) {
				this.buttClient.stopRecording(this.buttCallback)
			} else {
				this.buttClient.startRecording(this.buttCallback)
			}
		} else {
			switch (action.action) {
				case 'start_streaming':
					this.buttClient.startStreaming(this.buttCallback)
					break
				case 'stop_streaming':
					this.buttClient.stopStreaming(this.buttCallback)
					break
				case 'start_recording':
					this.buttClient.startRecording(this.buttCallback)
					break
				case 'stop_recording':
					this.buttClient.stopRecording(this.buttCallback)
					break
				case 'split_recording':
					this.buttClient.splitRecording(this.buttCallback)
					break
				case 'set_streaming_signal_threshold':
					this.buttClient.setStreamingSignalThreshold(action.options.threshold, this.buttCallback)
					break
				case 'set_streaming_silence_threshold':
					this.buttClient.setStreamingSilenceThreshold(action.options.threshold, this.buttCallback)
					break
				case 'set_recording_signal_threshold':
					this.buttClient.setRecordingSignalThreshold(action.options.threshold, this.buttCallback)
					break
				case 'set_recording_silence_threshold':
					this.buttClient.setRecordingSilenceThreshold(action.options.threshold, this.buttCallback)
					break
				case 'update_song_name':
					this.buttClient.updateSongName(action.options.song_name, this.buttCallback)
					break
			}
		}
	}

	startStatusTimer() {
		this.ticks = 0
		this.statusTimer = setInterval(() => {
			this.buttClient.getStatus((err, buttStatus) => {
				if (!err && buttStatus) {
					// success
					this.status(this.STATE_OK, JSON.stringify(buttStatus))
					this.processStatus(buttStatus)
					this.checkFeedbacks()
					this.ticks++
				} else {
					// failure
					this.status(
						this.STATE_ERROR,
						'Error while getting status, make sure BUTT server is running on the configured IP/port or restart it manually. Error: ' +
							(err ? err : 'No status recieved')
					)
					this.processStatus({})
					this.checkFeedbacks()
				}
			})
		}, this.config.timer_interval)
		this.log('debug', 'BUTT status timer started')
	}

	processStatus(buttStatus) {
		this.setVariables(buttStatus)
		this.serverStatus = buttStatus
		this.debug('processStatus', buttStatus)
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
				label: 'Short scrolling active song name being streamed',
				name: 'stream_song_name_short',
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
				label: 'Total amount of data sent for the active stream',
				name: 'stream_data_sent',
			},
			{
				label: 'Absolute path for the recording directory',
				name: 'recording_file_path',
			},
			{
				label: 'Short scrolling absolute path for the recording directory',
				name: 'recording_file_path_short',
			},
			{
				label: 'Active file name being recorded to',
				name: 'recording_file_name',
			},
			{
				label: 'Short scrolling active file name being recorded to',
				name: 'recording_file_name_short',
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
				label: 'Total amount of data saved for the active recording',
				name: 'recording_data_saved',
			},
			{
				label: 'Volume level in decibels (left)',
				name: 'volume_left',
			},
			{
				label: 'Volume level in decibels (right)',
				name: 'volume_right',
			},
		])
	}

	extractShortString(str, maxLength) {
		if (!str) {
			return ''
		}
		if (str.length <= maxLength) {
			return str
		}
		let start = this.ticks % str.length
		return str.substring(start, start + maxLength)
	}

	secondsToHhMmSs(seconds) {
		if (!seconds) {
			return '00:00:00'
		}
		let pad = (num) => {
			return ('0' + num).slice(-2)
		}
		let hh = pad(Math.floor(seconds / 3600))
		let mm = pad(Math.floor((seconds % 3600) / 60))
		let ss = pad(Math.floor((seconds % 3600) % 60))
		return `${hh}:${mm}:${ss}`
	}

	kiloBytesToHumanReadable(kiloBytes) {
		if (!kiloBytes) {
			return '0K'
		}
		kiloBytes = parseInt(kiloBytes)
		let units = ['K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y']
		let i = 0
		while (kiloBytes >= 1024) {
			kiloBytes /= 1024
			i++
		}
		return `${kiloBytes.toFixed(i ? 2 : 0)}${units[i]}`
	}

	splitPathToDirectoryAndFileName(path) {
		if (!path) {
			return ['', '']
		}
		let parts = path.split('/')
		let fileName = parts.pop()
		let directory = parts.join('/')
		return [directory, fileName]
	}

	setVariables(status) {
		let maxLength = this.config.scrolling_text_max_length
		this.setVariable('stream_song_name', status.song)
		this.setVariable('stream_song_name_short', this.extractShortString(status.song, maxLength))
		let pathParts = this.splitPathToDirectoryAndFileName(status.recPath)
		this.setVariable('recording_file_path', pathParts[0])
		this.setVariable('recording_file_path_short', this.extractShortString(pathParts[0], maxLength))
		this.setVariable('recording_file_name', pathParts[1])
		this.setVariable('recording_file_name_short', this.extractShortString(pathParts[1], maxLength))
		this.setVariable('stream_duration', status.streamSeconds)
		this.setVariable('stream_duration_hhmmss', this.secondsToHhMmSs(status.streamSeconds))
		this.setVariable('recording_duration', status.recordSeconds)
		this.setVariable('recording_duration_hhmmss', this.secondsToHhMmSs(status.recordSeconds))
		this.setVariable('stream_data_sent', this.kiloBytesToHumanReadable(status.streamKByte))
		this.setVariable('recording_data_saved', this.kiloBytesToHumanReadable(status.recordKByte))
		this.setVariable('volume_left', status.volumeLeft)
		this.setVariable('volume_right', status.volumeRight)
	}

	STREAM_CONNECTING_STYLE = {
		color: this.rgb(0, 0, 0),
		bgcolor: this.rgb(255, 255, 0),
		text: 'Conn...',
		size: '18',
	}

	STREAM_CONNECTED_STYLE = {
		color: this.rgb(0, 0, 0),
		bgcolor: this.rgb(0, 255, 0),
		text: '$(butt:stream_duration_hhmmss)\\n$(butt:stream_song_name_short)',
		size: '18',
		alignment: 'left:center',
	}

	RECORDING_STYLE = {
		color: this.rgb(0, 0, 0),
		bgcolor: this.rgb(0, 255, 0),
		text: '$(butt:recording_duration_hhmmss)\\n$(butt:recording_data_saved)',
		size: '18',
	}

	SIGNAL_TRANSITION_STYLE = {
		color: this.rgb(0, 0, 0),
		bgcolor: this.rgb(255, 255, 0),
	}

	SIGNAL_PRESENCE_STYLE = {
		color: this.rgb(0, 0, 0),
		bgcolor: this.rgb(0, 255, 0),
	}

	ERROR_STYLE = {
		color: this.rgb(0, 0, 0),
		bgcolor: this.rgb(255, 0, 0),
		text: 'ERR',
		size: 'auto',
		alignment: 'center:center',
	}

	initFeedbacks() {
		let feedbacks = {
			streaming_connecting_status: {
				type: 'boolean',
				label: 'Streaming connecting status',
				style: this.STREAM_CONNECTING_STYLE,
			},
			streaming_connected_status: {
				type: 'boolean',
				label: 'Streaming connected status',
				style: this.STREAM_CONNECTED_STYLE,
			},
			recording_status: {
				type: 'boolean',
				label: 'Recording status',
				style: this.RECORDING_STYLE,
			},
			signal_transition_status: {
				type: 'boolean',
				label: 'Signal transition status',
				style: this.SIGNAL_TRANSITION_STYLE,
			},
			signal_presence_status: {
				type: 'boolean',
				label: 'Signal presence status',
				style: this.SIGNAL_PRESENCE_STYLE,
			},
			error_status: {
				type: 'boolean',
				label: 'Error status',
				style: this.ERROR_STYLE,
			},
		}
		this.setFeedbackDefinitions(feedbacks)
	}

	feedback(feedback) {
		switch (feedback.type) {
			case 'streaming_connected_status':
				return this.serverStatus.connected
			case 'streaming_connecting_status':
				return this.serverStatus.connecting
			case 'recording_status':
				return this.serverStatus.recording
			case 'signal_presence_status':
				return this.serverStatus.signalDetected
			case 'signal_transition_status':
				return !this.serverStatus.signalDetected && !this.serverStatus.silenceDetected
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
					text: 'Stream Radio',
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
						style: this.STREAM_CONNECTING_STYLE,
					},
					{
						type: 'streaming_connected_status',
						style: this.STREAM_CONNECTED_STYLE,
					},
				],
			},
			{
				category: 'Commands',
				label: 'Toggle recording',
				bank: {
					style: 'text',
					text: 'Record Radio',
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
						style: this.RECORDING_STYLE,
					},
				],
			},
			{
				category: 'Commands',
				label: 'Toggle signal presence',
				bank: {
					style: 'text',
					text: 'Radio Signal',
					size: '18',
					color: this.rgb(255, 255, 255),
					bgcolor: this.rgb(0, 0, 0),
				},
				feedbacks: [
					{
						type: 'signal_transition_status',
						style: this.SIGNAL_TRANSITION_STYLE,
					},
					{
						type: 'signal_presence_status',
						style: this.SIGNAL_PRESENCE_STYLE,
					},
					{
						type: 'error_status',
						style: this.ERROR_STYLE,
					},
				],
			},
		]
		this.setPresetDefinitions(presets)
	}
}
exports = module.exports = instance
