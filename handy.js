AFRAME.registerComponent('handy', {
    schema: {
      hand: { default: 'left' }, // Mano a detectar (derecha o izquierda)
      fingerTipJoint: { default: 'index-finger-tip' } // Articulación de la punta del dedo a utilizar
    },
  
    init: function () {
        this.el.addEventListener('handup', function (event) {
          console.log('¡Mano arriba!', event.detail);
        });
    
        this.el.addEventListener('handdown', function (event) {
          console.log('¡Mano abajo!', event.detail);
        });
    },
  
    update: function () {
    },
  
    onModelLoaded: function () {
    },
  
    tick: function () {
      // Lógica para determinar si la mano está boca arriba.
      // Por ejemplo, podrías verificar si el dedo índice está apuntando hacia arriba.
  
      var controller = this.el.components['hand-tracking-controls'];
      // console.log(controller)
      if (!controller) { return; }
      if (controller.indexTipPosition.y > 0.1) {
        // console.log('la mano esta boca arriba');
      }
  
      // TEST FUNCTION
  
      var trackedController = this.el.components['tracked-controls'];
      if (!trackedController) { return; }
      const hand = trackedController.controller.hand
  
      var WRIST_INDEX = 0;
      var THUMB_TIP_INDEX = 4;
      var INDEX_TIP_INDEX = 9;
  
      var thumbTipPosition = new THREE.Vector3();
      var jointPose = new THREE.Matrix4();
      var indexTipPosition = new THREE.Vector3();
      var wristTipPosition = new THREE.Vector3();
      var wristRotation = new THREE.Quaternion();
  
      wristRotation.setFromRotationMatrix(jointPose.fromArray(controller.jointPoses, WRIST_INDEX * 16));
      thumbTipPosition.setFromMatrixPosition(jointPose.fromArray(controller.jointPoses, THUMB_TIP_INDEX * 16));
      indexTipPosition.setFromMatrixPosition(jointPose.fromArray(controller.jointPoses, INDEX_TIP_INDEX * 16));
  
      var jointRadi = controller.jointRadii[WRIST_INDEX]
  
      
  
      if (-0.02 <= wristRotation.y <= 0.02) {
        this.el.emit('handdown', controller.indexTipPosition);
      } else if (wristRotation.y > 0.08) {
        console.log(wristRotation.y)
        console.log(controller)
        console.log(controller.skinnedMesh.parent.rotation)
        console.log(controller.skinnedMesh.parent.quaternion)
        console.log(jointRadi)
        this.el.emit('handup', controller.indexTipPosition);
      } else {
        this.el.emit('handdown', controller.indexTipPosition);
      }
    },
  
  
    remove: function () {
    }
  });