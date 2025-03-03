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
         if (this.data.hand == 'left'){
            jointEntity.setAttribute('id', `Left_${jointName}`); 
         } else {
            jointEntity.setAttribute('id', `Right_${jointName}`); 
         }
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
                  if (jointName == 'index-finger-tip' || jointName == 'wrist'){
                      if (!jointEntity.hasAttribute('obb-collider')) {
                         jointEntity.setAttribute('obb-collider', `size: ${radius * 2} ${radius * 2} ${radius * 2}`);
                      }
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
                  this.el.emit('pinchstart', { hand: this.data.hand });
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
      this.lastGrabState = null;
      this.isGrabbed = false;
      this.hooverState = false;
      this.colideRight = false;
      this.colideLeft = false;

      // Inicialización de los vectores
      this.vectorX = new THREE.Vector3();
      this.vectorZ = new THREE.Vector3();
      this.vectorXZ = new THREE.Vector3();
      this.fakeX = new THREE.Vector3();
      this.fakeY = new THREE.Vector3();
      this.fakeZ = new THREE.Vector3();
      this.rotationMatrix = new THREE.Matrix4();
   },

   tick: function () {
      this.check();
   },

   check: function () {
      const manoDerecha = this.rightHandEntity.components.manos;
      const detectorDerecho = this.rightDetector.components.detector;
      const manoIzquierda = this.leftHandEntity.components.manos;
      const detectorIzquierdo = this.leftDetector.components.detector;
      this.collidingEntities = new Set();

      this.el.addEventListener('obbcollisionstarted', (evt) => {
         this.isGrabbed = true;
         const otro = evt.detail.withEl.id
         if (otro.startsWith('Right')){
            this.colideRight = true;
         } else{
            this.colideLeft = true;
         }
         
         document.querySelector('#text2').setAttribute('text', `value: Colision con derecha: ${this.colideRight} Colision con izquierda: ${this.colideLeft}`);
         
      });

      this.el.addEventListener('obbcollisionended', (evt) => {
        const otro = evt.detail.withEl.id
        if (otro.startsWith('Right')){
            this.colideRight = false;
         } else{
            this.colideLeft = false;
         }
         this.isGrabbed = false;
         document.querySelector('#text2').setAttribute('text', `value: Colision con derecha: ${this.colideRight} Colision con izquierda: ${this.colideLeft}`);
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
      const Colide = this.isGrabbed;
      if (this.colideLeft || this.colideRight){
         this.hooverState = true;
      } else {this.hooverState = false;}
      this.hoover(this.hooverState);

      
      this.updateState(rightPinchState, leftPinchState, manoDerecha, manoIzquierda); 
   
   },

   updateState: function (rightPinch, leftPinch, manoDerecha, manoIzquierda) {
      const indexTipRight = manoDerecha.joints["index-finger-tip"];
      const indexTipLeft = manoIzquierda.joints["index-finger-tip"];

      if ((this.colideRight || this.colideLeft ) && (rightPinch || leftPinch)) {
         if ((this.colideLeft && this.colideRight) && (rightPinch && leftPinch)) {
            this.el.setAttribute('material', 'color', 'black');
            this.reparent(this.el.sceneEl);
            this.el.emit('stretchStart', {hand1: indexTipLeft, hand2: indexTipRight})
   
         } else if (this.colideLeft && leftPinch) {
            this.el.setAttribute('material', 'color', 'blue');
            this.el.emit('stretchEnd');
            const newPosition = indexTipLeft.object3D.position;
   
            this.el.setAttribute('position', {
               x: newPosition.x,
               y: this.el.getAttribute('position').y,
               z: this.el.getAttribute('position').z
            });
         } else if (this.colideRight && rightPinch){ // revisar por que no entra aqui
            this.el.setAttribute('material', 'color', 'green');
            this.updateFakeCoords();
            this.reparent(indexTipRight.object3D);
            this.el.emit('stretchEnd');
         }
      
      } else {
         this.el.setAttribute('material', 'color', 'red');
         this.reparent(this.el.sceneEl);
      }
   },
   
   hoover: function(hoover){
      if (hoover){
         this.el.setAttribute('material', 'opacity', '0.8');
      } else{
         this.el.setAttribute('material', 'opacity', '1');
      }
   },

   updateFakeCoords: function () {
      // Actualizar las posiciones de las esferas de la mano derecha
      const manoDerecha = this.rightHandEntity.components.manos;
      const pos1 = manoDerecha.joints["index-finger-metacarpal"].object3D.position;
      const pos2 = manoDerecha.joints["index-finger-tip"].object3D.position;
      const pos3 = manoDerecha.joints["pinky-finger-metacarpal"].object3D.position;

      // Calcular el vector X (de esfera1 a esfera2)
      this.vectorX.copy(pos2).sub(pos1).normalize();
      this.fakeX.copy(this.vectorX);

      // Calcular el vector Z (perpendicular al eje X, desde esfera3)
      this.vectorXZ.copy(pos3).sub(pos1);
      this.vectorZ.crossVectors(this.vectorX, this.vectorXZ).normalize();
      this.fakeZ.copy(this.vectorZ);

      // Calcular el eje Y como el producto cruzado entre X y Z
      this.fakeY.crossVectors(this.fakeZ, this.fakeX).normalize();

      // Asegurarnos de que el sistema sea ortonormal
      if (this.fakeY.length() === 0) {
         this.fakeZ.negate();
         this.fakeY.crossVectors(this.fakeZ, this.fakeX).normalize();
      }

      // Definir la matriz de rotación usando los ejes falsos
      this.rotationMatrix.makeBasis(this.fakeX, this.fakeY, this.fakeZ);

      // Aplicar la rotación al cubo
      this.el.object3D.setRotationFromMatrix(this.rotationMatrix);
   },

   reparent: function (newParent) {
      const el = this.el;

      // Verificar si el nuevo padre es un elemento DOM o un Object3D
      if (!newParent) {
         console.error('Nuevo padre no válido:', newParent);
         return;
      }

      // Si el nuevo padre es un objeto DOM, tomamos su object3D
      if (newParent instanceof HTMLElement) {
         newParent = newParent.object3D;  // Convertimos el DOM a object3D
      }

      // Si el nuevo padre es un object3D, hacemos el reparenting
      if (newParent instanceof THREE.Object3D) {
         // Verificamos si ya es hijo del nuevo padre
         if (el.object3D.parent === newParent) return;

         // Guardar la posición global del cubo estático
         const worldPosition = new THREE.Vector3();
         worldPosition.setFromMatrixPosition(el.object3D.matrixWorld);

         // Mover el object3D al nuevo padre
         newParent.attach(el.object3D);

         // Si el nuevo padre no es la escena, ajustar la posición local
         if (newParent !== this.el.sceneEl.object3D) {
            const localPosition = new THREE.Vector3();
            localPosition.setFromMatrixPosition(newParent.matrixWorld).negate();
            localPosition.add(worldPosition);
            el.object3D.position.copy(localPosition);
         } else {
            // Si el nuevo padre es la escena, restaurar la posición original
            el.object3D.position.copy(worldPosition);
         }
      } else {
         console.error('Nuevo padre debe ser un HTMLElement o un Object3D.');
      }
   },
});

AFRAME.registerComponent('stretch', {

   init: function () {
      this.el.addEventListener('stretchStart', this.onGrabStart.bind(this));
      this.el.addEventListener('stretchEnd', this.onGrabEnd.bind(this));
      this.hand1 = null;
      this.hand2 = null;
      this.initialDistance = null;
      this.previousDistance = null;
      this.currentScale = null;
      document.querySelector('#text').setAttribute('text', `value: iniciamos stretch`);
   },

   onGrabStart: function (event) {
      if (event.detail.hand1 && event.detail.hand2) {
         document.querySelector('#text').setAttribute('text', `value: Datos del evento stretchStart ${event.detail.hand1.id} y ${event.detail.hand2.id}`);
         this.hand1 = event.detail.hand1;
         this.hand2 = event.detail.hand2;

         const hand1Pos = this.hand1.object3D.position;
         const hand2Pos = this.hand2.object3D.position;
         
         this.initialDistance = hand1Pos.distanceTo(hand2Pos);
         this.previousDistance = this.initialDistance;

         // Guardar la escala actual antes de estirar
         this.currentScale = Object.assign({}, this.el.getAttribute('scale'));
      }
   },

   onGrabEnd: function () {
      document.querySelector('#text').setAttribute('text', `value: Evento strechEnd`);
      this.hand1 = null;
      this.hand2 = null;
      this.initialDistance = null;
      this.previousDistance = null;
   },

   tick: function () {
      if (this.hand1 && this.hand2) {
         const hand1Pos = this.hand1.object3D.position;
         const hand2Pos = this.hand2.object3D.position;
         const currentDistance = hand1Pos.distanceTo(hand2Pos);

         // 🔹 Solo modificar la escala si la distancia entre las manos ha cambiado
         if (Math.abs(currentDistance - this.previousDistance) > 0.01) {
         const scaleFactor = currentDistance / this.initialDistance;

         document.querySelector('#text').setAttribute('text', `value: Datos del evento stretchStart ${this.hand1.id} y ${this.hand2.id} Current distance : ${currentDistance} y scale factor ${scaleFactor}`);

         this.el.setAttribute('scale', 
            this.currentScale.x * scaleFactor,
            this.currentScale.y * scaleFactor,
            this.currentScale.z * scaleFactor
         );

         // Actualizamos la distancia previa
         this.previousDistance = currentDistance;
         }
      }
   }
});
