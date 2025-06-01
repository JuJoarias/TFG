let contadorAciertos = 0;
let totalCubos = 5;
let cuentaRegresiva = 30;
let cuentaIntervalo;
const pistolThreshold = 0.04;
const pinchDistance = 0.02;
const curlThreshold = 0.105;

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

AFRAME.registerComponent('clickable', {
    init: function () {
        this.el.sceneEl.addEventListener('clickStart', this.onClickStart.bind(this));
        this.el.sceneEl.addEventListener('clickend', this.onClickEnd.bind(this));
        this.Clicked = false;
        this.isClicking = false;
        this.id = null;
        // Guardamos el color original
        this.originalColor = this.el.getAttribute('color') || 'white';
    },
    onClickStart: function (event) {
        if (this.isClicking) return;
        this.id = event.detail.id
        if (this.id === this.el.id){
            this.isClicking = true;
            this.Clicked = true;
        }
    },
    onClickEnd: function () {
        this.Clicked = false;
        this.isClicking = false;
        this.id = null;
    },
    tick: function () {
        if (this.Clicked) {
            // Aumentar contador
            contadorAciertos++;
            document.querySelector('#contadorTexto').setAttribute('value', `Aciertos: ${contadorAciertos}`);
            // Eliminar cubo
            this.el.parentNode.removeChild(this.el);
        } 
    }
});

AFRAME.registerComponent('generar-cubos', {
  init: function () {
    this.el.sceneEl.addEventListener('iniciar-juego', () => {
      const escena = this.el;
      for (let i = 1; i <= totalCubos; i++) {
        const cubo = document.createElement('a-box');
        const angulo = Math.random() * 2 * Math.PI;
        const distancia = Math.random() * 3 + 1.5;
        const x = Math.cos(angulo) * distancia;
        const z = Math.sin(angulo) * distancia;
        const y = Math.random() * 2 + 1;
        cubo.setAttribute('id', `cubo${i}`);
        cubo.setAttribute('position', `${x} ${y} ${z}`);
        cubo.setAttribute('color', '#FF0000');
        cubo.setAttribute('depth', 0.5);
        cubo.setAttribute('height', 0.5);
        cubo.setAttribute('width', 0.5);
        cubo.setAttribute('clickable', '');
        escena.appendChild(cubo);
      }
    });
  }
});

AFRAME.registerComponent('panel-inicial', {
  init: function () {
    this.el.addEventListener('clickStart', () => {
      // Eliminar panel
      this.el.parentNode.removeChild(this.el);
      // Iniciar el juego
      document.querySelector('a-scene').emit('iniciar-juego');
      // Iniciar cuenta atrás
      cuentaIntervalo = setInterval(() => {
        cuentaRegresiva--;
        document.querySelector('#tiempoTexto').setAttribute('value', `Tiempo: ${cuentaRegresiva}`);
        if (cuentaRegresiva <= 0 || contadorAciertos == totalCubos) {
          clearInterval(cuentaIntervalo);
          mostrarResultado();
        }
      }, 1000);
    });
  }
});
function mostrarResultado() {
  const camara = document.querySelector('[camera]');
  const mensaje = document.createElement('a-text');
  mensaje.setAttribute('value', contadorAciertos === totalCubos ? 'You Win!' : 'Game Over');
  mensaje.setAttribute('color', contadorAciertos === totalCubos ? 'green' : 'red');
  mensaje.setAttribute('align', 'center');
  mensaje.setAttribute('position', '0 0 -2');
  mensaje.setAttribute('scale', '2 2 2');
  camara.appendChild(mensaje);
}