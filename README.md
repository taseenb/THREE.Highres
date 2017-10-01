# THREE.Highres

High resolution rendering to PNG for Three.js, including depth map rendering.


### Setup
```
var highRes = new Highres(renderer, scene, camera, options)
highres.enable()
```

Options:

```
{
onStart: () => {
    // you can pause animations here, but leave orbit controls if possible
},
onBeforeRender: () => {
    // make sure your application is not rendering at all now
},
onAfterRender: () => {
    // you can restart rendering
},
onExit: () => {
    // you can restart all your animations now
}
```


### Usage

Press + to start the high resolution rendering process.

Press - for the depth map rendering process.

Follow the instructions.


### Disable
```
highres.disable()
```

**[DEMO](https://taseenb.github.io/THREE.Highres/demo/index.html)**
