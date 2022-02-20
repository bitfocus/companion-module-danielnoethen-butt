const instance_skel = require('../../instance_skel')

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

	static GetUpgradeScripts() {
		return []
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
			},
			{
				type: 'textinput',
				id: 'server_ip',
				label: 'IP address of the server (default: 127.0.0.1)',
				width: 12,
			},
			{
				type: 'textinput',
				id: 'server_port',
				label: 'Port of the server (default: 1256)',
				width: 12,
			}
		]
	}

	// When module gets deleted
	destroy() {
		this.debug('destroy')
		this.system.removeListener('custom_variables_update', this.updateCustomVariables)
	}

	FIELD_URL = {
		type: 'textwithvariables',
		label: 'URL',
		id: 'url',
		default: '',
	}

	FIELD_BODY = {
		type: 'textwithvariables',
		label: 'Body',
		id: 'body',
		default: '{}',
	}

	FIELD_HEADER = {
		type: 'textwithvariables',
		label: 'header input(JSON)',
		id: 'header',
		default: '',
	}

	FIELD_CONTENTTYPE = {
		type: 'dropdown',
		label: 'Content Type',
		id: 'contenttype',
		default: 'application/json',
		choices: [
			{ id: 'application/json', label: 'application/json' },
			{ id: 'application/x-www-form-urlencoded', label: 'application/x-www-form-urlencoded' },
			{ id: 'application/xml', label: 'application/xml' },
			{ id: 'text/html', label: 'text/html' },
			{ id: 'text/plain', label: 'text/plain' },
		],
	}

	FIELD_JSON_DATA_VARIABLE = null

	actions() {
		this.FIELD_JSON_DATA_VARIABLE = {
			type: 'dropdown',
			label: 'JSON Response Data Variable',
			id: 'jsonResultDataVariable',
			default: '',
			choices: Object.entries(this.customVariables).map(([id, info]) => ({
				id: id,
				label: id,
			})),
		}
		this.FIELD_JSON_DATA_VARIABLE.choices.unshift({ id: '', label: '<NONE>' })

		this.setActions({
			post: {
				label: 'POST',
				options: [this.FIELD_URL, this.FIELD_BODY, this.FIELD_HEADER, this.FIELD_CONTENTTYPE],
			},
			get: {
				label: 'GET',
				options: [this.FIELD_URL, this.FIELD_HEADER, this.FIELD_JSON_DATA_VARIABLE],
			},
			put: {
				label: 'PUT',
				options: [this.FIELD_URL, this.FIELD_BODY, this.FIELD_HEADER, this.FIELD_CONTENTTYPE],
			},
			patch: {
				label: 'PATCH',
				options: [this.FIELD_URL, this.FIELD_BODY, this.FIELD_HEADER, this.FIELD_CONTENTTYPE],
			},
			delete: {
				label: 'DELETE',
				options: [this.FIELD_URL, this.FIELD_BODY, this.FIELD_HEADER],
			},
		})
	}

	action(action) {
		let cmd = ''
		let body = {}
		let header = {}
		let restCmds = {
			post: 'rest',
			get: 'rest_get',
			put: 'rest_put',
			patch: 'rest_patch',
			delete: 'rest_delete',
		}
		let restCmd = restCmds[action.action]
		let errorHandler = (e, result) => {
			if (e !== null) {
				this.log('error', `HTTP ${action.action.toUpperCase()} Request failed (${e.message})`)
				this.status(this.STATUS_ERROR, result.error.code)
			} else {
				this.status(this.STATUS_OK)
			}
		}

		let jsonResultDataHandler = (e, result) => {
			if (e !== null) {
				this.log('error', `HTTP ${action.action.toUpperCase()} Request failed (${e.message})`)
				this.status(this.STATUS_ERROR, result.error.code)
			} else {
				// store json result data into retrieved dedicated custom variable
				let jsonResultDataVariable = action.options.jsonResultDataVariable
				if (jsonResultDataVariable !== '') {
					this.debug('jsonResultDataVariable', jsonResultDataVariable)
					let jsonResultData = JSON.stringify(result.data)
					this.system.emit('custom_variable_set_value', jsonResultDataVariable, jsonResultData)
				}
				this.status(this.STATUS_OK)
			}
		}

		let options = {
			connection: {
				rejectUnauthorized: this.config.rejectUnauthorized,
			},
		}

		this.system.emit('variable_parse', action.options.url, (value) => {
			cmd = value
		})

		if (action.options.url.substring(0, 4) !== 'http') {
			if (this.config.prefix.length > 0) {
				cmd = `${this.config.prefix}${cmd.trim()}`
			}
		}

		if (action.options.body && action.options.body.trim() !== '') {
			this.system.emit('variable_parse', action.options.body, (value) => {
				body = value
			})

			if (action.options.contenttype && action.options.contenttype === 'application/json') {
				//only parse the body if we are explicitly sending application/json
				try {
					body = JSON.parse(body)
				} catch (e) {
					this.log('error', `HTTP ${action.action.toUpperCase()} Request aborted: Malformed JSON Body (${e.message})`)
					this.status(this.STATUS_ERROR, e.message)
					return
				}
			}
		}

		if (action.options.header.trim() !== '') {
			this.system.emit('variable_parse', action.options.header, (value) => {
				header = value
			})

			try {
				header = JSON.parse(header)
			} catch (e) {
				this.log('error', `HTTP ${action.action.toUpperCase()} Request aborted: Malformed JSON Header (${e.message})`)
				this.status(this.STATUS_ERROR, e.message)
				return
			}
		}

		if (restCmd === 'rest_get') {
			this.system.emit(restCmd, cmd, jsonResultDataHandler, header, options)
		} else {
			if (action.options.contenttype) {
				header['Content-Type'] = action.options.contenttype
			}
			this.system.emit(restCmd, cmd, body, errorHandler, header, options)
		}
	}
}
exports = module.exports = instance
