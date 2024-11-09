<template>
    <a-scene>
      <a-box position="0 1.5 -3" rotation="0 45 0" color="#4CC3D9"></a-box>
      <a-sphere position="0 3 -5" radius="1.25" color="#EF2D5E"></a-sphere>
      <a-cylinder position="-1 1 -3" radius="0.5" height="2" color="#FFC65D"></a-cylinder>
      <a-plane position="0 0 -4" rotation="-90 0 0" width="4" height="4" color="#7BC8A4"></a-plane>
      <a-sky color="#ECECEC"></a-sky>
    </a-scene>
  </template>
  
  <script>
  export default {
    name: 'AframeScene',
  }
  </script>
  
  <style scoped>
  a-scene {
    width: 100%;
    height: 100vh;
  }
  </style>
  