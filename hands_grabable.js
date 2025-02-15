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
         jointEntity.setAttribute('id', jointName);
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
                  const radius = jointPose.radius || 0.008;  // Radio del joint
                  jointEntity.setAttribute('position', { x, y, z });
                  jointEntity.setAttribute('radius', radius);
                  // Definir `obb-collider` con el mismo tamaño que el joint
                  if (!jointEntity.hasAttribute('obb-collider')) {
                     jointEntity.setAttribute('obb-collider', `size: ${radius * 2} ${radius * 2} ${radius * 2}`);
                  }
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
                  const indexTip = this.frame.getJointPose(inputSource.hand.get("index-finger-tip"), this.referenceSpace);
                  this.el.emit('pinchstart', { hand: this.data.hand });
                  this.el.emit('index-tip-update', indexTip.transform.position);
               } else if (pinchDistanceCalc >= pinchDistance && this.pinchState) {
                  this.pinchState = false;
                  this.el.emit('pinchend', { hand: this.data.hand });
               }
            }

            // Detectar si los dedos están doblados
            if (wrist && indexTip && middleTip && ringTip && pinkyTip) {

               const isIndexExtended = this.isFingerExtended(indexTip, wrist);
               const isMiddleBent = !this.isFingerExtended(middleTip, wrist);
               const isRingBent = !this.isFingerExtended(ringTip, wrist);
               const isPinkyBent = !this.isFingerExtended(pinkyTip, wrist);

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

   isFingerExtended: function (fingerTip, wrist) {
      return Math.sqrt(
         Math.pow(fingerTip.transform.position.x - wrist.transform.position.x, 2) +
         Math.pow(fingerTip.transform.position.y - wrist.transform.position.y, 2) +
         Math.pow(fingerTip.transform.position.z - wrist.transform.position.z, 2)
      ) > curlThreshold;}  
});

// Componente `detector`
AFRAME.registerComponent('detector', {
   schema: { 
      target: { type: 'selector' }, 
      hand: { type: 'string', default: 'left' } 
   },

   init: function () {
      this.isGrabbed = false;
     
      // Escuchar gestos de la mano
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
 
AFRAME.registerComponent('grabable', {
   init: function () {
      if (!this.el.hasAttribute('obb-collider')) {
         this.el.setAttribute('obb-collider', 'size: auto');
      }

      this.leftHandEntity = document.querySelector('#left-hand');
      this.rightHandEntity = document.querySelector('#right-hand');
      this.leftDetector = document.querySelector('#left-detector');
      this.rightDetector = document.querySelector('#right-detector');
      this.lastPinchState = null;
      this.lastGrabState = null;
      this.initialDistance = null;
      this.isGrabbed = false;
      this.indexFingerTip = null;
   },

   tick: function () {
      this.check();
   },

   check: function () {

      const manoDerecha = this.rightHandEntity.components.manos;
      const detectorDerecho = this.rightDetector.components.detector;
      const manoIzquierda = this.leftHandEntity.components.manos;
      const detectorIzquierdo = this.leftDetector.components.detector;
   
      this.el.addEventListener('obbcollisionstarted',(evt) => {   // mirar con que componente esta siendo la colision para poder distinguir mejor las cosas
         this.isGrabbed = true;
      });
   
      this.el.addEventListener('obbcollisionended', (evt) => {
         this.isGrabbed = false;
      });

      if (!this.rightHandEntity || !manoDerecha) {
         document.querySelector('#text').setAttribute('text', `value: La mano derecha no se detecta correctamente`);
         return;
      }

      if (!this.rightDetector || !detectorDerecho) {
         document.querySelector('#text').setAttribute('text', `value: No se detecta el detector de la mano derecha`);
         return;
      }

      if (!this.leftHandEntity || !manoIzquierda) {
         document.querySelector('#text').setAttribute('text', `value: La mano izquierda no se detecta correctamente`);
         return;
      }

      if (!this.leftDetector || !detectorIzquierdo) {
         document.querySelector('#text').setAttribute('text', `value: No se detecta el detector de la mano izquierda`);
         return;
      }

      const rightPinchState = manoDerecha.pinchState;
      const leftPinchState = manoIzquierda.pinchState;
      // const elementIDright = detectorDerecho.otherElement;
      // const elementIDleft = detectorIzquierdo.otherElement;
      const Colide = this.isGrabbed;
      
      if (rightPinchState !== this.lastPinchState || Colide !== this.lastGrabState || leftPinchState !== this.lastPinchState ) {
         
         document.querySelector('#text').setAttribute('text', `value: Colide: ${Colide}, Pinch derecha: ${rightPinchState}, Pinch izquierda: ${leftPinchState}`); 
         this.lastPinchState = rightPinchState;
         this.lastGrabState = Colide;
            
         this.updateState(rightPinchState, Colide, leftPinchState, manoDerecha, manoIzquierda);
         
      }
   },

   updateState: function (rightPinch, rightGrab, leftPinch, manoDerecha, manoIzquierda) {
      
      if (rightGrab && rightPinch) {

         this.el.addEventListener('index-tip-update', (event) => {
            this.indexFingerTip = event.detail; // Guardamos la posición cuando la recibimos
          });
         this.el.setAttribute('material', 'color', 'green');
         this.reparent(manoDerecha);

      } else if (rightGrab && leftPinch) {

         const indexTipLeft = manoIzquierda.joints["index-finger-tip"];
         this.el.setAttribute('material', 'color', 'blue');

         const newPosition = indexTipLeft.object3D.position;

         this.el.setAttribute('position', {
            x: newPosition.x, 
            y: this.el.getAttribute('position').y, 
            z: this.el.getAttribute('position').z  
         });

      } else {

         this.el.setAttribute('material', 'color', 'orange');
         this.reparent(this.el.sceneEl);
         this.initialDistance = null; // Reiniciar la distancia inicial cuando no hay pinch
      }
   },

   reparent: function (newParent) {
      const el = this.el;
      const parent = newParent;
      // console.log('parent: ' ,parent)

      // Si ya es hijo del nuevo padre, no hacer nada
      if (el.parentElement === parent) return;

      // Reparent, una vez que object3D esté listo
      const reparent = function () {
        // Adjuntamos el object3D al nuevo padre para obtener posición, rotación, escala
        parent.object3D.attach(el.object3D);
        const position = el.object3D.position.clone();
        const rotation = el.object3D.rotation.clone();
        const scale = el.object3D.scale.clone();

        // Creamos un nuevo elemento y copiamos el contenido actual
        const newEl = document.createElement(el.tagName);
        if (el.hasAttributes()) {
          const attrs = el.attributes;
          for (let i = attrs.length - 1; i >= 0; i--) {
            const attrName = attrs[i].name;
            const attrVal = el.getAttribute(attrName);
            newEl.setAttribute(attrName, attrVal);
          }
        }

        // Listener para cuando el nuevo elemento esté cargado
        const relocate = function () {
          newEl.object3D.position.copy(position);
          newEl.object3D.rotation.copy(rotation);
          newEl.object3D.scale.copy(scale);
        };

        newEl.addEventListener('loaded', relocate, { 'once': true });
        parent.appendChild(newEl);
        el.parentElement.removeChild(el);
      };

      // Si el object3D está listo, reparentamos directamente
      if (el.getObject3D('mesh')) {
        reparent();
      } else {
        // Esperamos a que el object3D esté listo
        el.sceneEl.addEventListener('object3dset', reparent, { 'once': true });
      }
    },
});