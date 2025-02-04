const pinchDistance = 0.02;

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
         schema: {
            hand: { type: 'string', default: 'left' } // izquierda o derecha
         },

         init: function () {
            this.frame = null;
            this.referenceSpace = null;
            this.joints = {};
            this.pinchState = false;

            // Crear entidades para las articulaciones
            orderedJoints.flat().forEach((jointName) => {
               const jointEntity = document.createElement('a-sphere');
               jointEntity.setAttribute('color', 'white'); // Ambas manos serán blancas
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


         detectGesture: function () {
            const session = this.el.sceneEl.renderer.xr.getSession();
            const inputSources = session.inputSources;

            for (const inputSource of inputSources) {
               if (inputSource.handedness === this.data.hand && inputSource.hand) {
                  const thumbTip = this.frame.getJointPose(inputSource.hand.get("thumb-tip"), this.referenceSpace);
                  const indexTip = this.frame.getJointPose(inputSource.hand.get("index-finger-tip"), this.referenceSpace);

                  if (thumbTip && indexTip) {
                     const distance = Math.sqrt(
                        Math.pow(thumbTip.transform.position.x - indexTip.transform.position.x, 2) +
                        Math.pow(thumbTip.transform.position.y - indexTip.transform.position.y, 2) +
                        Math.pow(thumbTip.transform.position.z - indexTip.transform.position.z, 2)
                     );

                     if (distance < pinchDistance && !this.pinchState) {
                        this.pinchState = true;
                        this.el.emit('pinchstart', { hand: this.data.hand });
                     } else if (distance >= pinchDistance && this.pinchState) {
                        this.pinchState = false;
                        this.el.emit('pinchend', { hand: this.data.hand });
                     }
                  }
               }
            }

         }
      });

      // Componente `detector`
      AFRAME.registerComponent('detector', {
         schema: {
            target: { type: 'selector' },
            hand: { type: 'string', default: 'left' } // Mano a escuchar
         },

         init: function () {
            this.el.sceneEl.addEventListener('pinchstart', (evt) => {
               if (evt.detail.hand === this.data.hand) {
                  this.updateText("¡Inicio de gesto " + this.data.hand + "!");
               }
            });

            this.el.sceneEl.addEventListener('pinchend', (evt) => {
               if (evt.detail.hand === this.data.hand) {
                  this.updateText("¡Fin de gesto " + this.data.hand + "!");
               }
            });
         },

         updateText: function (message) {
            if (this.data.target) {
               this.data.target.setAttribute('text', `value: ${message}; color: #FFF`);
            }
         }
      });