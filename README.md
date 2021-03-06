# THREE.Highres

High resolution rendering to PNG for Three.js, including depth map rendering.


### Setup
```
var Highres = require('three.highres')

// or use a script tag <script src="THREE.Highres.js"></script>

var highres = new Highres(renderer, scene, camera, options)
highres.enable()
```

Options:

```
{
    onStart: () => {
        // triggered when you press + or -
        // you can pause your animations here
        // keep orbit controls (or any navigation helper you may need to prepare the shot)
        // hide elements you don't want to appear in the final rendering
    },
    onBeforeRender: () => {
        // triggered after you choose a number and the rendering is about to start
        // make sure your application is not rendering at all now
        // stop all CPU/GPU intensive work
    },
    onAfterRender: () => {
        // triggered when the PNG is ready
        // you can restart rendering
    },
    onExit: () => {
        // triggered when you press ESC
        // you can restart your animations now
    }
}
```


### Usage

Press + to start the rendering process.

Press - for the depth map rendering.

Follow the instructions.


### Disable
```
highres.disable()
```

**[DEMO](https://taseenb.github.io/THREE.Highres/demo/index.html)**
