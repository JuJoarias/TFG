const pinchDistance = 0.02;
const curlThreshold = 0.09; // Umbral de curvatura para detectar si un dedo está doblado

const orderedJoints = [
   ["wrist"],
   ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
   ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
   ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
   ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
   ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"]
];

AFRAME.registerComponent('manos', {
   schema: { hand: { type: 'string', default: 'left' } },
   init: function () {
      this.frame = null;
      this.referenceSpace = null;
      this.joints = {};
      this.pinchState = false;
      this.fistState = false;
      this.pointState = false;
      this.openHandState = false;

      orderedJoints.flat().forEach((jointName) => {
         const jointEntity = document.createElement('a-sphere');
         jointEntity.setAttribute('color', 'white');
         this.el.appendChild(jointEntity);
         this.joints[jointName] = jointEntity;
      });
   },
   tick: function () {
      if (!this.frame) {
         this.frame = this.el.sceneEl.frame;
         this.referenceSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
      } else {
         this.updateSkeleton();
         this.detectGesture();
      }
   },
   updateSkeleton: function () {
      const session = this.el.sceneEl.renderer.xr.getSession();
      const inputSources = session.inputSources;
      for (const inputSource of inputSources) {
         if (inputSource.handedness === this.data.hand && inputSource.hand) {
            for (const [jointName, jointEntity] of Object.entries(this.joints)) {
               const joint = inputSource.hand.get(jointName);
               const jointPose = this.frame.getJointPose(joint, this.referenceSpace);
               if (jointPose) {
                  const { x, y, z } = jointPose.transform.position;
                  const radius = jointPose.radius;
                  jointEntity.setAttribute('position', { x, y, z });
                  jointEntity.setAttribute('radius', radius || 0.008);
               } else {
                  jointEntity.setAttribute('position', '0 0 0');
               }
            }
         }
      }
   },
   detectGesture: function () {
      const session = this.el.sceneEl.renderer.xr.getSession();
      const inputSources = session.inputSources;
      for (const inputSource of inputSources) {
         if (inputSource.handedness === this.data.hand && inputSource.hand) {
            const thumbTip = this.frame.getJointPose(inputSource.hand.get("thumb-tip"), this.referenceSpace);
            const indexTip = this.frame.getJointPose(inputSource.hand.get("index-finger-tip"), this.referenceSpace);
            const middleTip = this.frame.getJointPose(inputSource.hand.get("middle-finger-tip"), this.referenceSpace);
            const ringTip = this.frame.getJointPose(inputSource.hand.get("ring-finger-tip"), this.referenceSpace);
            const pinkyTip = this.frame.getJointPose(inputSource.hand.get("pinky-finger-tip"), this.referenceSpace);
            const wrist = this.frame.getJointPose(inputSource.hand.get("wrist"), this.referenceSpace);

            if (thumbTip && indexTip) {
               const pinchDistanceCalc = Math.sqrt(
                  Math.pow(thumbTip.transform.position.x - indexTip.transform.position.x, 2) +
                  Math.pow(thumbTip.transform.position.y - indexTip.transform.position.y, 2) +
                  Math.pow(thumbTip.transform.position.z - indexTip.transform.position.z, 2)
               );

               if (pinchDistanceCalc < pinchDistance && !this.pinchState) {
                  this.pinchState = true;
                  this.el.emit('pinchstart', { hand: this.data.hand });
               } else if (pinchDistanceCalc >= pinchDistance && this.pinchState) {
                  this.pinchState = false;
                  this.el.emit('pinchend', { hand: this.data.hand });
               }
            }

            // Detectar si los dedos están doblados
            if (wrist && indexTip && middleTip && ringTip && pinkyTip) {
               const distance = Math.sqrt(
                  Math.pow(indexTip.transform.position.x - wrist.transform.position.x, 2) +
                  Math.pow(indexTip.transform.position.y - wrist.transform.position.y, 2) +
                  Math.pow(indexTip.transform.position.z - wrist.transform.position.z, 2)
               );

               const isIndexBent = this.isFingerBended(indexTip, wrist);
               const isMiddleBent = this.isFingerBended(middleTip, wrist);
               const isRingBent = this.isFingerBended(ringTip, wrist);
               const isPinkyBent = this.isFingerBended(pinkyTip, wrist);
               // Llamar a la función que actualiza el texto
               this.updateIndexText(isIndexBent);
               this.updateMidleText(isMiddleBent);
               this.updateRingText(isRingBent);
               this.updatePinkyText(isPinkyBent);

               // Fist (Puño cerrado)
               if (!isIndexExtended && isMiddleBent && isRingBent && isPinkyBent && !this.fistState) {
                  this.fistState = true;
                  this.el.emit('fiststart', { hand: this.data.hand });
               } else if ((isIndexExtended || !isMiddleBent || !isRingBent || !isPinkyBent) && this.fistState) {
                  this.fistState = false;
                  this.el.emit('fistend', { hand: this.data.hand });
               }

               // Point (Apuntar con el índice)
               if (isIndexExtended && isMiddleBent && isRingBent && isPinkyBent && !this.pointState) {
                  this.pointState = true;
                  this.el.emit('pointstart', { hand: this.data.hand });
               } else if ((!isIndexExtended || !isMiddleBent || !isRingBent || !isPinkyBent) && this.pointState) {
                  this.pointState = false;
                  this.el.emit('pointend', { hand: this.data.hand });
               }

               // Open Hand (Mano abierta)
               if (isIndexExtended && !isMiddleBent && !isRingBent && !isPinkyBent && !this.openHandState) {
                  this.openHandState = true;
                  this.el.emit('openhandstart', { hand: this.data.hand });
               } else if ((!isIndexExtended || isMiddleBent || isRingBent || isPinkyBent) && this.openHandState) {
                  this.openHandState = false;
                  this.el.emit('openhandend', { hand: this.data.hand });
               }
            }
         }
      }
   },

   updateIndexText: function (text) {
      const distanceText = document.getElementById("index");
      if (distanceText) {
         distanceText.setAttribute('text', `value: Index bend: ${text}; color: #FFF`);
      }
   },
   updateMidleText: function (text) {
      const distanceText = document.getElementById("midle");
      if (distanceText) {
         distanceText.setAttribute('text', `value: midle bend: ${text}; color: #FFF`);
      }
   },
   updateRingText: function (text) {
      const distanceText = document.getElementById("ring");
      if (distanceText) {
         distanceText.setAttribute('text', `value: ring bend: ${text}; color: #FFF`);
      }
   },
   updatePinkyText: function (text) {
      const distanceText = document.getElementById("pinky");
      if (distanceText) {
         distanceText.setAttribute('text', `value: pinky bend: ${text}; color: #FFF`);
      }
   },

   isFingerBended: function (fingerTip, wrist) {
      return Math.abs(fingerTip.transform.position.y - wrist.transform.position.y) > curlThreshold;
   }
});

// Componente `detector`
AFRAME.registerComponent('detector', {
   schema: { target: { type: 'selector' }, hand: { type: 'string', default: 'left' } },
   init: function () {
      ['pinch', 'fist', 'point', 'openhand'].forEach((gesture) => {
         this.el.sceneEl.addEventListener(`${gesture}start`, (evt) => {
            if (evt.detail.hand === this.data.hand) {
               this.updateText(`¡Inicio de ${gesture} con ${this.data.hand}!`);
            }
         });
         this.el.sceneEl.addEventListener(`${gesture}end`, (evt) => {
            if (evt.detail.hand === this.data.hand) {
               this.updateText(`¡Fin de ${gesture} con ${this.data.hand}!`);
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
