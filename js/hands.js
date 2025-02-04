const orderedJoints = [
   ["wrist"],
   ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
   ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
   ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
   ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
   ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"]
];

// Componente `manos` con renderizado del esqueleto
AFRAME.registerComponent('manos', {
   schema: { hand: { type: 'string', default: 'left' } },
 
   init: function () {
      this.joints = {};
      orderedJoints.flat().forEach((jointName) => {
         const jointEntity = document.createElement('a-sphere');
         jointEntity.setAttribute('color', 'white'); 
         this.el.appendChild(jointEntity);
         this.joints[jointName] = jointEntity;
      });
      this.pinchState = false;
      this.fistState = false;
      this.pointState = false;
      this.openHandState = false;
   },
 
   tick: function () {
      this.updateSkeleton();
      this.detectGestures();
   },

   updateSkeleton: function () {
      const session = this.el.sceneEl.renderer.xr.getSession();
      if (!session) {
         return; // Si no hay sesión, salimos de la función
      }
      const inputSources = session.inputSources;

      for (const inputSource of inputSources) {
         if (inputSource.handedness === this.data.hand && inputSource.hand) {
            for (const [jointName, jointEntity] of Object.entries(this.joints)) {
                  const joint = inputSource.hand.get(jointName);
                  const jointPose = this.frame.getJointPose(joint, this.referenceSpace);

                  if (jointPose) {
                     const { x, y, z } = jointPose.transform.position;
                     const radius = jointPose.radius; // Obtener el radio dinámicamente

                     // Actualizar la posición de la articulación de la mano
                     jointEntity.setAttribute('position', { x, y, z });
                     jointEntity.setAttribute('radius', radius || 0.008); // Usar el radio o un valor predeterminado
                  } else {
                     jointEntity.setAttribute('position', '0 0 0'); // Esconder si no hay datos
                  }
            }
         }
      }
   },
  
 
   detectGestures: function () {
      const thumbTip = this.getJointPosition('thumb-tip');
      const indexTip = this.getJointPosition('index-finger-tip');
      const allFingertips = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'].map(j => this.getJointPosition(j));
      const palm = this.getJointPosition('wrist');
      
      // Detect pinch
      if (thumbTip && indexTip) {
         const distance = this.getDistance(thumbTip, indexTip);
         this.handleGesture(distance < 0.02, 'pinch');
      }

      // Detect fist (all fingers close to palm)
      if (allFingertips.every(finger => finger && this.getDistance(finger, palm) < 0.05)) {
         this.handleGesture(true, 'fist');
      } else {
         this.handleGesture(false, 'fist');
      }

      // Detect point (only index extended)
      if (indexTip && this.getDistance(indexTip, palm) > 0.1 && allFingertips.slice(1).every(f => f && this.getDistance(f, palm) < 0.05)) {
         this.handleGesture(true, 'point');
      } else {
         this.handleGesture(false, 'point');
      }

      // Detect open hand (all fingers extended)
      if (allFingertips.every(f => f && this.getDistance(f, palm) > 0.1)) {
         this.handleGesture(true, 'openHand');
      } else {
         this.handleGesture(false, 'openHand');
      }
   },

   handleGesture: function (isActive, gesture) {
      if (isActive && !this[gesture + 'State']) {
         this[gesture + 'State'] = true;
         this.el.emit(gesture + 'start', { hand: this.data.hand });
      } else if (!isActive && this[gesture + 'State']) {
         this[gesture + 'State'] = false;
         this.el.emit(gesture + 'end', { hand: this.data.hand });
      }
   },

   getJointPosition: function (jointName) {
      const joint = this.el.components['tracked-controls']?.controller?.hand?.get(jointName);
      if (!joint) return null;
      const pose = this.frame.getJointPose(joint, this.referenceSpace);
      return pose ? pose.transform.position : null;
   },

   getDistance: function (pos1, pos2) {
      return Math.sqrt(
         Math.pow(pos1.x - pos2.x, 2) +
         Math.pow(pos1.y - pos2.y, 2) +
         Math.pow(pos1.z - pos2.z, 2)
      );
   }
});
 
AFRAME.registerComponent('detector', {
   schema: { target: { type: 'selector' }, hand: { type: 'string', default: 'left' } },

   init: function () {
      ['pinch', 'fist', 'point', 'openHand'].forEach(gesture => {
         this.el.sceneEl.addEventListener(gesture + 'start', (evt) => {
            if (evt.detail.hand === this.data.hand) {
               this.updateText(`¡${gesture} detectado (${this.data.hand})!`);
            }
         });
         this.el.sceneEl.addEventListener(gesture + 'end', (evt) => {
            if (evt.detail.hand === this.data.hand) {
               this.updateText(`Fin de ${gesture} (${this.data.hand})`);
            }
         });
      });
   },

   updateText: function (message) {
      if (this.data.target) {
         this.data.target.setAttribute('text', `value: ${message}; color: #FFF`);
      }
   }
});
 