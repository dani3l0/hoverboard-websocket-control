let speed = 0
let steer = 0
let incomingData = {
	cmd1: 0,
	cmd2: 0,
	speedR: 0,
	speedL: 0,
	batV: 0,
	temp: 0,
}

// Websocket connection
const socket = new WebSocket(`ws://${window.location.host}/ws`)
socket.binaryType = "arraybuffer"
socket.addEventListener("open", e => {
	console.log("CONNECTED")
})
socket.addEventListener("message", e => {
	data = new Int16Array(e.data)
	incomingData.cmd1 = data[1]
	incomingData.cmd2 = data[2]
	incomingData.speedR = data[3]
	incomingData.speedL = data[4]
	incomingData.batV = data[5]
	incomingData.temp = data[6]
	console.log(data)
})
const sendControls = () => {
	let data = new Uint16Array([0xABCD, steer, speed])
	let xorChecksum = data.reduce((accumulator, current) => accumulator ^ current, 0)
	let data2 = new Uint16Array([0xABCD, steer, speed, xorChecksum])
	if (socket.readyState == socket.OPEN) socket.send(data2)
}
setInterval(() => {
	sendControls()
}, 25)

// Joystick controls
const initJoystick = () => {
	const base = document.getElementById('joystick-base')
	const handle = document.getElementById('joystick-handle')
	let active = false

	const move = (e) => {
		if (!active) return
		const rect = base.getBoundingClientRect()
		const radius = rect.width / 2
		const clientX = e.touches ? e.touches[0].clientX : e.clientX
		const clientY = e.touches ? e.touches[0].clientY : e.clientY
		let x = clientX - rect.left - radius
		let y = clientY - rect.top - radius
		const distance = Math.sqrt(x*x + y*y)
		if (distance > radius) {
			x = (x / distance) * radius
			y = (y / distance) * radius
		}
		handle.style.left = `calc(50% + ${(x / radius) * 50}%)`
		handle.style.top = `calc(50% + ${(y / radius) * 50}%)`
		speed = Math.round((-y / radius) * 1000)
		steer = Math.round((x / radius) * 1000)
	}
	
	const end = () => {
		active = false
		handle.style.left = '50%'
		handle.style.top = '50%'
		speed = 0
		steer = 0
	}

	// Mouse
	base.addEventListener('mousedown', (e) => { active = true; move(e); })
	window.addEventListener('mousemove', move)
	window.addEventListener('mouseup', end)

	// Touch
	base.addEventListener('touchstart', (e) => { active = true; move(e); })
	window.addEventListener('touchmove', move)
	window.addEventListener('touchend', end)
}

initJoystick()
