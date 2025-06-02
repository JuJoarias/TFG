const pinchDistance = 0.02;
const curlThreshold = 0.105; // Umbral de curvatura para detectar si un dedo está doblado
const pistolThreshold = 0.04;

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
       this.pointerEntity = null;
       this.intersectedObject = null;

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
            this.updatePointer();
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
             const indexPhalanx = this.frame.getJointPose(inputSource.hand.get("index-finger-phalanx-intermediate"), this.referenceSpace);
             const indexKnuckle = this.frame.getJointPose(inputSource.hand.get("index-finger-phalanx-proximal"), this.referenceSpace);  
             const middleTip = this.frame.getJointPose(inputSource.hand.get("middle-finger-tip"), this.referenceSpace);
             const ringTip = this.frame.getJointPose(inputSource.hand.get("ring-finger-tip"), this.referenceSpace);
             const pinkyTip = this.frame.getJointPose(inputSource.hand.get("pinky-finger-tip"), this.referenceSpace);
             const wrist = this.frame.getJointPose(inputSource.hand.get("wrist"), this.referenceSpace);

             this.detectPinch(thumbTip, indexTip); 

             // Detectar si los dedos están doblados
             if (wrist && indexTip && middleTip && ringTip && pinkyTip && indexPhalanx && thumbTip && indexKnuckle) {

                const isIndexExtended = this.calcDistance(indexTip, wrist) > curlThreshold;
                const isMiddleBent = !(this.calcDistance(middleTip, wrist) > curlThreshold);
                const isRingBent = !(this.calcDistance(ringTip, wrist) > curlThreshold);
                const isPinkyBent = !(this.calcDistance(pinkyTip, wrist) > curlThreshold);
                const pistol = this.calcDistance(indexPhalanx, thumbTip) < pistolThreshold;

                // Fist (Puño cerrado)
                this.detectFist(isIndexExtended, isMiddleBent, isRingBent, isPinkyBent, this.fistState);

                // Point (Apuntar con el índice)   // hacer funcion de este gesto(y todos de paso) para poder llamar la funcion en cada tick en vez de que compruebe una sola vez
                this.detectPoint(isIndexExtended, isMiddleBent, isRingBent, isPinkyBent, this.pointState, pistol, indexKnuckle, indexTip);

                // Open Hand (Mano abierta)
                this.detectOpenhand(isIndexExtended, isMiddleBent, isRingBent, isPinkyBent, this.openHandState);
             }
          }
       }
    },

    detectPinch: function (thumbTip, indexTip){
        if (thumbTip && indexTip) {
            const pinchDistanceCalc = this.calcDistance(thumbTip, indexTip)

            if (pinchDistanceCalc < pinchDistance && !this.pinchState) {
               this.pinchState = true;
               this.el.emit('pinchstart', { hand: this.data.hand }, true);
            } else if (pinchDistanceCalc >= pinchDistance && this.pinchState) {
               this.pinchState = false;
               this.el.emit('pinchend', { hand: this.data.hand }, true);
            }
        }
    },

    detectFist: function(isIndexExtended, isMiddleBent, isRingBent, isPinkyBent, fistState){
        if (!isIndexExtended && isMiddleBent && isRingBent && isPinkyBent && !fistState) {
            this.fistState = true;
            this.el.emit('fiststart', { hand: this.data.hand });
         } else if ((isIndexExtended || !isMiddleBent || !isRingBent || !isPinkyBent) && fistState) {
            this.fistState = false;
            this.el.emit('fistend', { hand: this.data.hand });
         }
    },

    detectPoint: function(isIndexExtended, isMiddleBent, isRingBent, isPinkyBent, pointState, pistol, indexKnuckle, indexTip) {
        if (isIndexExtended && isMiddleBent && isRingBent && isPinkyBent ) {
            this.pointState = true;
            this.el.emit('pointstart', { hand: this.data.hand });
            
            if (!pistol) {
                if (this.pointerEntity) {
                    this.el.emit('clickend');
                    return;
                }
                
                // Crea una nueva entidad para el puntero
                this.pointerEntity = document.createElement('a-entity');
                
                // Configura el raycaster para el puntero
                this.pointerEntity.setAttribute('raycaster', {
                    objects: '*',  // Interactuar con todo
                    far: 100,        // Distancia máxima
                    showLine: true, // Muestra la línea del rayo
                    interval: 50  // Reduce la frecuencia de actualización
                });
                
                // Posiciona el puntero en la punta del dedo
                this.pointerEntity.setAttribute('position', indexTip.transform.position);
                
                // Añade el puntero a la escena
                this.el.appendChild(this.pointerEntity);

            } else if (pistol){
                this.intersectedObject = this.pointerEntity.components.raycaster.intersectedEls;
                
                
                //Emitir el evento con el ID de la colisión falta probar
                if (this.intersectedObject.length > 0) {
                    this.el.emit('clickStart', { id: this.intersectedObject[0].id });
                } 
                
            }
        } else if ((!isIndexExtended || !isMiddleBent || !isRingBent || !isPinkyBent) && pointState) {
            this.pointState = false;
            this.el.emit('pointend', { hand: this.data.hand });            
            if (this.pointerEntity) {
                this.el.removeChild(this.pointerEntity);
                this.el.emit('clickend');
                this.pointerEntity = null;
            }
        }
    },

    updatePointer: function () {
        if (!this.pointerEntity) return;
        
        const session = this.el.sceneEl.renderer.xr.getSession();
        const inputSources = session.inputSources;
        
        for (const inputSource of inputSources) {
            if (inputSource.handedness === this.data.hand && inputSource.hand) {
                const indexTip = this.frame.getJointPose(inputSource.hand.get("index-finger-tip"), this.referenceSpace);
                const indexKnuckle = this.frame.getJointPose(inputSource.hand.get("index-finger-phalanx-proximal"), this.referenceSpace);
                
                if (indexTip && indexKnuckle) {
                    // Actualiza la posición del puntero en la punta del dedo
                    this.pointerEntity.setAttribute('position', indexTip.transform.position);
                    
                    // Calcula la dirección entre el nudillo y la punta del dedo
                    const direction = new THREE.Vector3().subVectors(
                        new THREE.Vector3(indexKnuckle.transform.position.x, indexKnuckle.transform.position.y, indexKnuckle.transform.position.z),
                        new THREE.Vector3(indexTip.transform.position.x, indexTip.transform.position.y, indexTip.transform.position.z)
                    );
                    
                    // Rota el puntero para que apunte en la dirección del vector calculado
                    this.pointerEntity.object3D.lookAt(this.pointerEntity.object3D.position.clone().add(direction));
                }
            }
        }
    },

    detectOpenhand: function(isIndexExtended, isMiddleBent, isRingBent, isPinkyBent, openHandState){
        if (isIndexExtended && !isMiddleBent && !isRingBent && !isPinkyBent && !openHandState) {
            this.openHandState = true;
            this.el.emit('openhandstart', { hand: this.data.hand });
        } else if ((!isIndexExtended || isMiddleBent || isRingBent || isPinkyBent) && openHandState) {
            this.openHandState = false;
            this.el.emit('openhandend', { hand: this.data.hand });
        }
    },

    calcDistance: function (finger1, finger2) {
        return Math.sqrt(
            Math.pow(finger1.transform.position.x - finger2.transform.position.x, 2) +
            Math.pow(finger1.transform.position.y - finger2.transform.position.y, 2) +
            Math.pow(finger1.transform.position.z - finger2.transform.position.z, 2)
        );
    },  
});
 
AFRAME.registerComponent('grabable', {
    init: function () {
        if (!this.el.hasAttribute('obb-collider')) {
            this.el.setAttribute('obb-collider', 'size: auto');
        }

        this.leftHandEntity = document.querySelector('#left-hand');
        this.rightHandEntity = document.querySelector('#right-hand');
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
        const manoIzquierda = this.leftHandEntity.components.manos;
        this.collidingEntities = new Set();

        this.el.addEventListener('obbcollisionstarted', (evt) => {
            const otro = evt.detail.withEl.id
            if (otro.startsWith('Right')){
                this.colideRight = true;
            } else{
                this.colideLeft = true;
            }
        });

        this.el.addEventListener('obbcollisionended', (evt) => {
          const otro = evt.detail.withEl.id
            if (otro.startsWith('Right')){
                this.colideRight = false;
            } else{
                this.colideLeft = false;
            }
        });

        if (!this.rightHandEntity || !manoDerecha) {
           return;
        }

        if (!this.leftHandEntity || !manoIzquierda) {
           return;
        }

        const rightPinchState = manoDerecha.pinchState;
        const leftPinchState = manoIzquierda.pinchState;

        if (this.colideLeft || this.colideRight){
            this.el.emit('hooverStart');
        } else {this.el.emit('hooverEnd');}

        this.updateState(rightPinchState, leftPinchState, manoDerecha, manoIzquierda); 
      
    },

    updateState: function (rightPinch, leftPinch, manoDerecha, manoIzquierda) {
        const indexTipRight = manoDerecha.joints["index-finger-tip"];
        const indexTipLeft = manoIzquierda.joints["index-finger-tip"];

        if ((this.colideRight || this.colideLeft ) && (rightPinch || leftPinch)) {
            if ((this.colideLeft && this.colideRight) && (rightPinch && leftPinch)) {
                // this.el.setAttribute('material', 'color', 'black');
                this.el.emit('stretchStart', {hand1: indexTipLeft, hand2: indexTipRight})
                this.el.emit('slideEnd');
                this.el.emit('dragEnd');
            } else if (this.colideLeft && leftPinch) { 
                // this.el.setAttribute('material', 'color', 'blue');
                this.el.emit('slideStart', {finger: indexTipLeft})
                this.el.emit('stretchEnd');
                this.el.emit('dragEnd');
            } else if (this.colideRight && rightPinch){ 
                // this.el.setAttribute('material', 'color', 'green');
                this.el.emit('dragStart', {mano: manoDerecha, finger: indexTipRight})
                this.el.emit('stretchEnd');
                this.el.emit('slideEnd');
            }
          
        } else {
            // this.el.setAttribute('material', 'color', 'red');
            this.el.emit('stretchEnd');
            this.el.emit('slideEnd');
            this.el.emit('dragEnd');
        }
    },
});

AFRAME.registerComponent('drag', {
    init: function(){
        if (!this.el.hasAttribute('grabable')) {
            this.el.setAttribute('grabable', '');
        }

        this.el.addEventListener('dragStart', this.onDragStart.bind(this));
        this.el.addEventListener('dragEnd', this.onDragEnd.bind(this));
        this.finger = null,
        this.hand = null;
        this.isDragging = false;
        this.interval = null;
        
        this.vectorX = new THREE.Vector3();
        this.vectorZ = new THREE.Vector3();
        this.vectorXZ = new THREE.Vector3();
        this.fakeX = new THREE.Vector3();
        this.fakeY = new THREE.Vector3();
        this.fakeZ = new THREE.Vector3();
        this.rotationMatrix = new THREE.Matrix4();
    },

    onDragStart: function(event){
        if (this.isDragging) return;
        
        if (event.detail.mano && event.detail.finger){
            this.hand = event.detail.mano;
            this.finger = event.detail.finger;
        }
    },

    onDragEnd: function(){
        this.reparent(this.el.sceneEl);
        this.finger = null,
        this.hand = null;
        this.isDragging = false;
        
        this.vectorX = new THREE.Vector3();
        this.vectorZ = new THREE.Vector3();
        this.vectorXZ = new THREE.Vector3();
        this.fakeX = new THREE.Vector3();
        this.fakeY = new THREE.Vector3();
        this.fakeZ = new THREE.Vector3();
        this.rotationMatrix = new THREE.Matrix4();
        clearInterval(this.interval);
    },

    tick: function(){
        if (this.hand && this.finger){
            this.updateFakeCoords(this.hand);
            this.reparent(this.finger.object3D);
            this.interval = this.startDrawingTrail()
        }
    },

    updateFakeCoords: function (mano) {
        // Actualizar las posiciones de las esferas de la mano derecha
        const pos1 = mano.joints["index-finger-metacarpal"].object3D.position;
        const pos2 = mano.joints["index-finger-tip"].object3D.position;
        const pos3 = mano.joints["pinky-finger-metacarpal"].object3D.position;

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

    startDrawingTrail: function () {
        const pen = this.el;
        const scene = pen.sceneEl;

        this.interval = setInterval(() => {
            // Crear esfera
            const dot = document.createElement('a-sphere');
            dot.setAttribute('radius', 0.01);
            dot.setAttribute('color', 'green');

            // Obtener la posición global del pen
            const worldPos = new THREE.Vector3();
            pen.object3D.getWorldPosition(worldPos);

            // Establecer la posición en la esfera
            dot.setAttribute('position', `${worldPos.x} ${worldPos.y} ${worldPos.z}`);

            // Añadir a la escena (no al pen, para que no se mueva con él)
            scene.appendChild(dot);
        }, 100);

        return interval; // por si luego quieres parar el rastro con clearInterval(interval)
    },
});

AFRAME.registerComponent('hoover', {

    init: function(){
        if (!this.el.hasAttribute('grabable')) {
            this.el.setAttribute('grabable', '');
        }

       this.el.addEventListener('hooverStart', this.onHooverStart.bind(this));
       this.el.addEventListener('hooverEnd', this.onHooverEnd.bind(this));
       this.hooverState = false;
       this.isHoovering = false;
    },

    onHooverStart: function () {
       if (this.isHoovering) return;
       this.isHoovering = true;

       this.hooverState = true;
    },

    onHooverEnd: function () {
       this.hooverState = false;
       this.isHoovering = false;
    },

    tick: function () {
        if (this.hooverState){
           this.el.setAttribute('material', 'opacity', '0.8');
        } else{
           this.el.setAttribute('material', 'opacity', '1');
        }
    },
});
