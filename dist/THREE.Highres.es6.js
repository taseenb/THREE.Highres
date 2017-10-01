const download = require('downloadjs')
const PNG = require('pngjs').PNG
const fs = require('browserify-fs')

class Highres {
  constructor (renderer, scene, camera, options) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.onStart = options ? options.onStart : undefined
    this.onBeforeRender = options ? options.onBeforeRender : undefined
    this.onAfterRender = options ? options.onAfterRender : undefined
    this.onExit = options ? options.onExit : undefined

    this.default = {
      width: 2048,
      height: 2048
    }

    this.state = {
      mode: 'normal', // can be 'normal' (default) or 'depth'
      maxFactor: 1,
      originalWidth: null,
      originalHeight: null,
      width: null,
      height: null,
      factor: null,
      busy: false
    }

    // Check GPU texture size limits and set a maximum factor allowed
    const maxTextureSize = this.renderer.capabilities.maxTextureSize
    const maxFactor = Math.floor(maxTextureSize / this.default.width)
    this.set('maxTextureSize', maxTextureSize)
    this.set('maxFactor', maxFactor)

    this.initUI()
  }

  set (key, value) {
    this.state[key] = value
  }

  get (key) {
    return this.state[key]
  }

  initUI () {
    this.initDom()
    this.initStyles()

    this.onResize(true)
  }

  activateUI () {
    if (this.state.activeUI) return
    this.set('activeUI', true)

    this.hideAllMessages()

    // Show message box
    document.getElementById(this.domId + '').classList.add('show')
    document.getElementById(this.domId + '-message').classList.add('show')

    // Update mode title
    const mode = this.get('mode')
    const diffuseTitle = document.getElementById(
      this.domId + '-normal-mode-title'
    )
    const depthTitle = document.getElementById(
      this.domId + '-depth-mode-title'
    )
    if (mode === 'normal') {
      diffuseTitle.classList.add('show')
      depthTitle.classList.remove('show')
    } else {
      diffuseTitle.classList.remove('show')
      depthTitle.classList.add('show')
    }

    // Activate resize event
    window.addEventListener('resize', this.onResize.bind(this))

    console.log('Highres active.')
  }

  deactivateUI () {
    this.set('activeUI', false)

    this.hideAllMessages()
    document.getElementById(this.domId).classList.remove('show')
    document.getElementById(this.domId + '-message').classList.add('show')

    // Remove resize event
    window.removeEventListener('resize', this.onResize.bind(this))

    console.info('Highres inactive.')
  }

  enable () {
    document.body.addEventListener('keyup', this.keyHandler.bind(this), false)
  }

  disable () {
    document.body.removeEventListener('keyup', this.keyHandler.bind(this))
  }

  setupKeyEvents () {
    document.body.addEventListener('keyup', this.keyHandler.bind(this))
  }

  keyHandler (e) {
    if (this.state.busy) return

    const start = () => {
      this.activateUI()
      // User function
      if (this.onStart) {
        this.onStart()
      }
    }

    // Activate depth mode
    if (e.key === '-') {
      this.set('mode', 'depth')
      start()
    }

    // Activate diffuse mode
    if (e.key === '+') {
      this.set('mode', 'normal')
      start()
    }

    // Deactivate
    if (e.keyCode === 27) {
      this.deactivateUI()

      // User function
      if (this.onExit) {
        this.onExit()
      }
    }

    // Start the high res capture by pressing any number
    if (e.key.match(/^\d+$/)) {
      if (!this.state.activeUI) {
        console.warn(
          'Highres is inactive. To activate press + (or - for depth rendering).'
        )
        return
      }

      // User function
      if (this.onBeforeRender) {
        this.onBeforeRender()
      }

      // Get factor
      const factor = Math.min(parseInt(e.key), this.state.maxFactor)
      this.set('factor', factor)

      // Show loader
      this.showLoader()

      // Save start time
      this.set('startTime', Date.now())

      // Launch request (and restore renderer state when finished)
      setTimeout(() => {
        this.request(factor).then(filename => {
          this.hideAllMessages()
          this.set('endTime', Date.now())
          let duration = this.get('endTime') - this.get('startTime')
          duration = (duration / 1000).toFixed(2)

          document.getElementById(
            this.domId + '-filename'
          ).innerHTML = filename
          document.getElementById(
            this.domId + '-duration'
          ).innerHTML = `${duration} seconds`
          document
            .getElementById(this.domId + '-complete')
            .classList.add('show')
        })
      }, 250) // <<== important - tell the browser to finish everything before launching the request
    }
  }

  showLoader () {
    let w = this.default.width * this.state.factor
    let h = this.default.height * this.state.factor
    w = w || this.state.originalWidth
    h = h || this.state.originalHeight

    this.hideAllMessages()
    document.getElementById(this.domId + '-width').innerHTML = w
    document.getElementById(this.domId + '-height').innerHTML = h
    document.getElementById(this.domId + '-dpi').innerHTML =
      Math.floor(w / 300) + ' x ' + Math.floor(h / 300)
    document.getElementById(this.domId + '-loader').classList.add('show')
  }

  request (zoom) {
    if (!this.state.busy) {
      this.onResize(true)

      return new window.Promise((resolve, reject) => {
        let w, h, factor

        if (zoom === 0) {
          w = this.get('originalWidth')
          h = this.get('originalHeight')
          factor = 1
        } else {
          w = this.default.width
          h = this.default.height
          factor = zoom
        }

        this.set('width', w)
        this.set('height', h)
        this.set('factor', factor)
        this.set('busy', true)

        console.log(
          `Highres (${w * factor} x ${h * factor}) rendering started.`
        )
        // console.log(this.state)

        // Wait
        this.onRendered = filename => resolve(filename)
        this.onError = () => reject()

        // Start
        this.render()
      })
    } else {
      return Promise.resolve()
    }
  }

  /**
   * Creates a new SMAAPass and ensures that images are fully loaded.
   *
   * @param {Function} done - A callback. The new SMAAPass will be passed to this function.
   */
  // createSMAAPass (done) {
  //   this.smaaPass = new SMAAPass(window.Image)

  //   const areaTexture = this.smaaPass.weightsMaterial.uniforms.tArea.value
  //   const searchTexture = this.smaaPass.weightsMaterial.uniforms.tSearch.value

  //   areaTexture.image.addEventListener('load', () => {
  //     if (searchTexture.image.complete) {
  //       // done(this.smaaPass)
  //     }
  //   })

  //   searchTexture.image.addEventListener('load', () => {
  //     if (areaTexture.image.complete) {
  //       if (!searchTexture.image.complete) {
  //         this.createSMAAPass(done)
  //       } else {
  //         done(this.smaaPass)
  //       }
  //     }
  //   })

  //   // Reload.
  //   areaTexture.image.src = this.smaaPass.weightsMaterial.areaImage
  //   searchTexture.image.src = this.smaaPass.weightsMaterial.searchImage
  // }

  // Update the renderer with high res size and pixel ratio
  setupHighresRenderer () {
    this.camera.aspect = this.state.width / this.state.height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(this.state.factor)
    this.renderer.setSize(this.state.width, this.state.height)
  }

  render () {
    this.setupHighresRenderer()

    const size = this.renderer.getDrawingBufferSize()
    const arraySize = size.width * size.height * 4
    const array = new Uint8Array(arraySize)

    if (this.get('mode') === 'normal') {
      this.renderNormal(array, size)
    } else {
      this.renderDepth(array, size)
    }
  }

  renderNormal (array, size) {
    // METHOD 1 - Normal render target + three.js renderer (fastest, no Anti-Aliasing)
    // const anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    this.rt = new THREE.WebGLRenderTarget(size.width, size.height)
    this.renderer.render(this.scene, this.camera, this.rt)
    this.finishRender(array, size)

    // METHOD 2 - Postprocessing with SMAA (best quality, slower)
    // this.createSMAAPass(smaaPass => {
    //   this.composer = new EffectComposer(this.renderer)
    //   this.composer.addPass(new RenderPass(this.scene, this.camera))
    //   // const pass = new SMAAPass(window.Image) // buggy: image must be loaded async
    //   this.composer.addPass(smaaPass)
    //   this.composer.render()
    //   this.rt = this.composer.writeBuffer
    //   this.finishRender(array, size)
    // })
  }

  renderDepth (array, size) {
    // High res render target
    this.rt = new THREE.WebGLRenderTarget(size.width, size.height)

    // Create a multi render target with Float buffers
    const target = new THREE.WebGLRenderTarget(size.width, size.height)
    target.texture.format = THREE.RGBFormat
    target.texture.minFilter = THREE.NearestFilter
    target.texture.magFilter = THREE.NearestFilter
    target.texture.generateMipmaps = false
    target.stencilBuffer = false
    target.depthBuffer = true
    target.depthTexture = new THREE.DepthTexture()
    target.depthTexture.type = THREE.UnsignedShortType

    // Setup post processing stage
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const postMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
              void main() {
                  vUv = uv;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }`,
      fragmentShader: `
        #include <packing>
              varying vec2 vUv;
              uniform sampler2D tDiffuse;
              uniform sampler2D tDepth;
              uniform float cameraNear;
              uniform float cameraFar;
              float readDepth (sampler2D depthSampler, vec2 coord) {
                  float fragCoordZ = texture2D(depthSampler, coord).x;
                  float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
                  return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
              }
              void main() {
                  vec3 diffuse = texture2D(tDiffuse, vUv).rgb;
                  float depth = readDepth(tDepth, vUv);
                  gl_FragColor.rgb = vec3(depth);
                  gl_FragColor.a = 1.0;
              }`,
      uniforms: {
        cameraNear: { value: this.camera.near },
        cameraFar: { value: this.camera.far },
        tDiffuse: { value: target.texture },
        tDepth: { value: target.depthTexture }
      }
    })
    const postPlane = new THREE.PlaneBufferGeometry(2, 2)
    const postQuad = new THREE.Mesh(postPlane, postMaterial)
    const postScene = new THREE.Scene()
    postScene.add(postQuad)

    // Render
    this.renderer.render(this.scene, this.camera, target)
    this.renderer.render(postScene, postCamera, this.rt)

    this.finishRender(array, size)
  }

  // Fill the array with data from the pixels
  finishRender (array, size) {
    this.renderer.readRenderTargetPixels(
      this.rt,
      0,
      0,
      size.width,
      size.height,
      array
    )

    const png = this.convertArrayToPNG(array, size)
    this.downloadPNG(png)
  }

  // Convert buffer to PNG
  convertArrayToPNG (array, size) {
    const image = new PNG({
      width: size.width,
      height: size.height
    })

    let i, wi
    for (let x = 0; x < size.width; x++) {
      for (let y = 0; y < size.height; y++) {
        // PNG indeces
        i = (size.width * y + x) << 2

        // Flip Y
        // const flipY = size.height - y

        // WebGL indeces
        wi = (size.width * (size.height - y) + x) << 2

        image.data[i] = array[wi] // r
        image.data[i + 1] = array[wi + 1] // g
        image.data[i + 2] = array[wi + 2] // b
        image.data[i + 3] = array[wi + 3] // a
      }
    }

    return image
  }

  // Try to write and download the PNG file
  downloadPNG (image) {
    try {
      image.pack().pipe(fs.createWriteStream('newfile.png')).on('finish', e => {
        fs.readFile('newfile.png', (error, data) => {
          if (error) {
            this.manageError(error)
          } else {
            const blob = new window.Blob([data], { type: 'image/png' })
            const w = this.state.width * this.state.factor
            const h = this.state.height * this.state.factor
            const filename = `hr-${w}x${h}-${Date.now()}`
            download(blob, filename, 'image/png')

            this.restorePreviousState()
            this.onRendered(`${filename}.png`)
          }
        })
      })
    } catch (error) {
      this.manageError(error)
    }
  }

  manageError (error) {
    this.hideAllMessages()
    document.getElementById(this.domId + '-error').classList.add('show')
    this.onError(error)
    this.restorePreviousState()
  }

  restorePreviousState () {
    this.set('busy', false)
    this.set('activeUI', false)
    this.rt.dispose()
    this.onResize()

    // User function
    if (this.onAfterRender) {
      this.onAfterRender()
    }

    console.log('Highres rendering complete.')
  }

  onResize (onlyUpdateState) {
    if (this.state.busy) return

    // const canvas = this.renderer.domElement
    // const canvasSize = canvas.parentElement.getBoundingClientRect()
    // const w = Math.floor(canvasSize.width)
    // const h = Math.floor(canvasSize.height)

    const w = window.innerWidth
    const h = window.innerHeight
    this.set('originalWidth', w)
    this.set('originalHeight', h)
    this.resizeCaptureArea()

    if (!onlyUpdateState) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
      this.renderer.setPixelRatio(window.devicePixelRatio || 1)
      this.renderer.setSize(w, h, true)
    }
  }

  resizeCaptureArea () {
    const captureArea = document.getElementById(this.domId + '-capture-area')
    const h = this.get('originalHeight')
    const ratio = this.default.width / this.default.height

    const cW = h * ratio
    const cH = h

    captureArea.style.width = cW + 'px'
    captureArea.style.height = cH + 'px'
  }

  initDom () {
    this.domId = 'high-res'
    const get = id => document.getElementById(id)
    const msgClass = this.domId + '-msg-box'
    this.dom('div', this.domId, document.body)
    this.dom('div', this.domId + '-capture-area', get(this.domId))
    this.dom('div', this.domId + '-modal-wrapper', get(this.domId))
    this.dom('div', this.domId + '-modal', get(this.domId + '-modal-wrapper'))

    // Messages containers
    this.dom(
      'div',
      this.domId + '-message',
      get(this.domId + '-modal'),
      `show ${msgClass}`
    )
    this.dom(
      'div',
      this.domId + '-loader',
      get(this.domId + '-modal'),
      msgClass
    )
    this.dom(
      'div',
      this.domId + '-complete',
      get(this.domId + '-modal'),
      msgClass
    )
    this.dom(
      'div',
      this.domId + '-error',
      get(this.domId + '-modal'),
      msgClass
    )

    // Info message
    const w = this.default.width
    const h = this.default.height
    const factor = 2 + Math.round(Math.random() * (this.state.maxFactor - 2))
    const hrW = w * factor
    const hrH = h * factor
    const inchW = Math.floor(hrW / 300)
    const inchH = Math.floor(hrH / 300)
    const maxTextureSize = this.state.maxTextureSize
    const maxFactor = this.state.maxFactor
    const maxInches = Math.floor(maxTextureSize / 300)

    this.html(
      `<div class="title mode" id="${this
        .domId}-normal-mode-title">High resolution rendering</div>
          
          <div class="title mode" id="${this
            .domId}-depth-mode-title">Depth rendering</div>
        <br><br>
        WARNING: <i>This can take time. The browser tab will be busy for a few seconds (or more).</i>
        <ul>
          <li>
              To start rendering press a number from <strong>0 to ${maxFactor}</strong>.  
              This value will be used as a factor of ${w} x ${h} and the result will be the size of the final PNG image (0 will result in a screenshot of the scene at your current resolution).
          </li>
          <li>
              Your GPU supports ${maxTextureSize} x ${maxTextureSize} textures (${maxInches} x ${maxInches} inches at 300 dpi), so the maximum factor you can use is <strong>${maxFactor}</strong>.
          </li>
          <li>
              The rectangle shows the area that will be captured (it can be larger than the viewport).
          </li>
        </ul>
        
        <strong>Example:</strong>
        <br>
        If you select <strong>${factor}</strong> you will get a ${factor}*${w} x ${factor}*${h} image = <strong>${hrW} x ${hrH}</strong>.
        <br>
        That is a nice <strong>${inchW} x ${inchH} inches</strong> print at <strong>300 dpi</strong>.
        <br><br>
        Press ESC to exit.
        `,
      this.domId + '-message'
    )

    // Loader message
    this.html(
      `<div class="title">Rendering</div>
      <br><br>
      Sit back and relax. A beautiful <span id="${this
        .domId}-width"></span> x <span id="${this.domId}-height"></span> 
      image (<span id="${this
        .domId}-dpi"></span> inches at 300 dpi) is on the way<span id="loader-dots">...</span>
      <br><br>
      The scene may resize and look distorted for a few seconds.
      `,
      this.domId + '-loader'
    )

    // Done message
    this.html(
      `<div class="title">Rendering completed</div>
      <br><br>
      It took <strong id="${this.domId}-duration"></strong>. 
      The file <strong id="${this.domId}-filename"></strong> is ready.
      <br><br>
      Press ESC to exit. Press + or - to start again.
      `,
      this.domId + '-complete'
    )

    // Error message
    this.html(
      `<div class="title">Erm...</div>
      <br><br>
      There was an error.
      <br><br>
      Press ESC to exit or reload the page.
      `,
      this.domId + '-error'
    )
  }

  dom (elType, id, parent, className) {
    const el = document.createElement(elType)
    el.setAttribute('id', id || '')
    el.className = className || ''
    parent.appendChild(el)
  }

  html (code, id) {
    document.getElementById(id).innerHTML = code
  }

  hideAllMessages () {
    const msg = document.getElementsByClassName(this.domId + '-msg-box')

    for (let i = 0; i < msg.length; i++) {
      msg[i].classList.remove('show')
    }
  }

  initStyles () {
    const css = `#${this.domId} {
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        display: none;
        font-family: Helvetica, Arial, sans-serif;
        font-size: 12px;
      }
  
      #${this.domId}.show {
        display: block;
      }
      
      #${this.domId}-modal-wrapper {
        position: absolute;
        width: 37.5%;
        min-width: 400px;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
      }
  
      #${this.domId}-modal {
        position: relative;
        width: 100%;
        background-color: #FFF;
        box-shadow: 0px 0px 30px 0px rgba(0,0,0,0.2);
        padding: 20px;
        color: #333;
        font-size: 12px;
        border-radius: 5px;
        box-sizing: border-box;
      }
  
      #${this.domId}-message {
        
      }
  
      .${this.domId}-msg-box {
        display: none;
      }
      .${this.domId}-msg-box.show {
        display: block;
      }
  
      .title {
        font-size: 14px;
        font-weight: bold;
      }
  
      .mode {
        display: none;
      }
  
      .mode.show {
        display: block;
      }
  
      #${this.domId}-loader {
        
      }
  
      #${this.domId}-complete {
      }
  
      #${this.domId}-capture-area {
        position: absolute;
        box-sizing: content-box;
        border: 1px solid #FFF;
        // box-shadow:inset 0 0 20px 0 rgba(0,0,0,0.3);
        box-shadow: 0 0 40px 0 rgba(0,0,0,0.5);
        background-color: transparent;
        left: 50%;
        top: 50%;
        transform: translateX(-50%) translateY(-50%);
      }
      `

    this.appendStyle(css)
  }

  appendStyle (css) {
    const head =
      window.document.head || window.document.getElementsByTagName('head')[0]
    const style = window.document.createElement('style')

    style.type = 'text/css'
    if (style.styleSheet) {
      style.styleSheet.cssText = css
    } else {
      style.appendChild(document.createTextNode(css))
    }

    head.appendChild(style)
  }
}

global.Highres = Highres
module.exports = Highres
