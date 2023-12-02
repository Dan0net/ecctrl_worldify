import { jsx, jsxs } from "react/jsx-runtime";
import { useGLTF, useAnimations, useKeyboardControls } from "@react-three/drei";
import { useThree, Canvas, useFrame } from "@react-three/fiber";
import { useRapier, RigidBody, CapsuleCollider, quat } from "@react-three/rapier";
import { useMemo, useEffect, useRef, Suspense, forwardRef, useState, useCallback } from "react";
import * as THREE from "three";
import { useControls } from "leva";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useSpring, animated } from "@react-spring/three";
const useFollowCam = function(props) {
  const { scene, camera } = useThree();
  let isMouseDown = false;
  let previousTouch1 = null;
  let previousTouch2 = null;
  let originZDis = props.camInitDis;
  const camMaxDis = props.camMaxDis;
  const camMinDis = props.camMinDis;
  const camMoveSpeed = props.camMoveSpeed;
  const camZoomSpeed = props.camZoomSpeed;
  const camCollisionOffset = props.camCollisionOffset;
  const pivot = useMemo(() => new THREE.Object3D(), []);
  const followCam = useMemo(() => {
    const origin = new THREE.Object3D();
    origin.position.set(0, 0, originZDis);
    return origin;
  }, []);
  let smallestDistance = null;
  let cameraDistance = null;
  let intersects = null;
  let intersectObjects = [];
  const cameraRayDir = useMemo(() => new THREE.Vector3(), []);
  const cameraRayOrigin = useMemo(() => new THREE.Vector3(), []);
  const cameraPosition = useMemo(() => new THREE.Vector3(), []);
  const camLerpingPoint = useMemo(() => new THREE.Vector3(), []);
  const camRayCast = new THREE.Raycaster(
    cameraRayOrigin,
    cameraRayDir,
    0,
    -camMaxDis
  );
  const onDocumentMouseMove = (e) => {
    if (document.pointerLockElement || isMouseDown) {
      pivot.rotation.y -= e.movementX * 2e-3 * camMoveSpeed;
      const vy = followCam.rotation.x + e.movementY * 2e-3 * camMoveSpeed;
      cameraDistance = followCam.position.length();
      if (vy >= -0.5 && vy <= 1.5) {
        followCam.rotation.x = vy;
        followCam.position.y = -cameraDistance * Math.sin(-vy);
        followCam.position.z = -cameraDistance * Math.cos(-vy);
      }
    }
    return false;
  };
  const onDocumentMouseWheel = (e) => {
    const vz = originZDis - e.deltaY * 2e-3 * camZoomSpeed;
    const vy = followCam.rotation.x;
    if (vz >= camMaxDis && vz <= camMinDis) {
      originZDis = vz;
      followCam.position.z = originZDis * Math.cos(-vy);
      followCam.position.y = originZDis * Math.sin(-vy);
    }
    return false;
  };
  const onTouchEnd = (e) => {
    previousTouch1 = null;
    previousTouch2 = null;
  };
  const onTouchMove = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const touch1 = e.targetTouches[0];
    const touch2 = e.targetTouches[1];
    if (previousTouch1 && !previousTouch2) {
      const touch1MovementX = touch1.pageX - previousTouch1.pageX;
      const touch1MovementY = touch1.pageY - previousTouch1.pageY;
      pivot.rotation.y -= touch1MovementX * 5e-3 * camMoveSpeed;
      const vy = followCam.rotation.x + touch1MovementY * 5e-3 * camMoveSpeed;
      cameraDistance = followCam.position.length();
      if (vy >= -0.5 && vy <= 1.5) {
        followCam.rotation.x = vy;
        followCam.position.y = -cameraDistance * Math.sin(-vy);
        followCam.position.z = -cameraDistance * Math.cos(-vy);
      }
    }
    if (previousTouch2) {
      const prePinchDis = Math.hypot(
        previousTouch1.pageX - previousTouch2.pageX,
        previousTouch1.pageY - previousTouch2.pageY
      );
      const pinchDis = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const vz = originZDis - (prePinchDis - pinchDis) * 0.01 * camZoomSpeed;
      const vy = followCam.rotation.x;
      if (vz >= camMaxDis && vz <= camMinDis) {
        originZDis = vz;
        followCam.position.z = originZDis * Math.cos(-vy);
        followCam.position.y = originZDis * Math.sin(-vy);
      }
    }
    previousTouch1 = touch1;
    previousTouch2 = touch2;
  };
  function customTraverse(object) {
    if (object.userData && object.userData.camExcludeCollision === true) {
      return;
    }
    if (object.isMesh && object.geometry.type !== "InstancedBufferGeometry") {
      intersectObjects.push(object);
    }
    object.children.forEach((child) => {
      customTraverse(child);
    });
  }
  const cameraCollisionDetect = (delta) => {
    cameraRayOrigin.copy(pivot.position);
    camera.getWorldPosition(cameraPosition);
    cameraRayDir.subVectors(cameraPosition, pivot.position);
    intersects = camRayCast.intersectObjects(intersectObjects);
    if (intersects.length && intersects[0].distance <= -originZDis) {
      smallestDistance = -intersects[0].distance * camCollisionOffset < -0.7 ? -intersects[0].distance * camCollisionOffset : -0.7;
    } else {
      smallestDistance = originZDis;
    }
    camLerpingPoint.set(
      followCam.position.x,
      smallestDistance * Math.sin(-followCam.rotation.x),
      smallestDistance * Math.cos(-followCam.rotation.x)
    );
    followCam.position.lerp(camLerpingPoint, delta * 4);
  };
  useEffect(() => {
    camera.position.set(0, 0, 0);
  }, []);
  useEffect(() => {
    scene.children.forEach((child) => customTraverse(child));
    followCam.add(camera);
    pivot.add(followCam);
    document.addEventListener("mousedown", () => {
      isMouseDown = true;
    });
    document.addEventListener("mouseup", () => {
      isMouseDown = false;
    });
    document.addEventListener("mousemove", onDocumentMouseMove);
    document.addEventListener("mousewheel", onDocumentMouseWheel);
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("mousedown", () => {
        isMouseDown = true;
      });
      document.removeEventListener("mouseup", () => {
        isMouseDown = false;
      });
      document.removeEventListener("mousemove", onDocumentMouseMove);
      document.removeEventListener("mousewheel", onDocumentMouseWheel);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchmove", onTouchMove);
    };
  });
  return { pivot, followCam, cameraCollisionDetect };
};
const useGame = /* @__PURE__ */ create(
  /* @__PURE__ */ subscribeWithSelector((set) => {
    return {
      /**
       * Character animations state manegement
       */
      // Initial animation
      curAnimation: null,
      animationSet: {},
      initializeAnimationSet: (animationSet) => {
        set((state) => {
          if (Object.keys(state.animationSet).length === 0) {
            return { animationSet };
          }
          return {};
        });
      },
      reset: () => {
        set((state) => {
          return { curAnimation: state.animationSet.idle };
        });
      },
      idle: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.jumpIdle) {
            return { curAnimation: state.animationSet.jumpLand };
          } else if (state.curAnimation !== state.animationSet.action1 && state.curAnimation !== state.animationSet.action2 && state.curAnimation !== state.animationSet.action3 && state.curAnimation !== state.animationSet.action4) {
            return { curAnimation: state.animationSet.idle };
          }
          return {};
        });
      },
      walk: () => {
        set((state) => {
          if (state.curAnimation !== state.animationSet.action4) {
            return { curAnimation: state.animationSet.walk };
          }
          return {};
        });
      },
      run: () => {
        set((state) => {
          if (state.curAnimation !== state.animationSet.action4) {
            return { curAnimation: state.animationSet.run };
          }
          return {};
        });
      },
      jump: () => {
        set((state) => {
          return { curAnimation: state.animationSet.jump };
        });
      },
      jumpIdle: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.jump) {
            return { curAnimation: state.animationSet.jumpIdle };
          }
          return {};
        });
      },
      jumpLand: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.jumpIdle) {
            return { curAnimation: state.animationSet.jumpLand };
          }
          return {};
        });
      },
      fall: () => {
        set((state) => {
          return { curAnimation: state.animationSet.fall };
        });
      },
      action1: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.idle) {
            return { curAnimation: state.animationSet.action1 };
          }
          return {};
        });
      },
      action2: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.idle) {
            return { curAnimation: state.animationSet.action2 };
          }
          return {};
        });
      },
      action3: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.idle) {
            return { curAnimation: state.animationSet.action3 };
          }
          return {};
        });
      },
      action4: () => {
        set((state) => {
          if (state.curAnimation === state.animationSet.idle || state.curAnimation === state.animationSet.walk || state.curAnimation === state.animationSet.run) {
            return { curAnimation: state.animationSet.action4 };
          }
          return {};
        });
      }
      /**
       * Additional animations
       */
      // triggerFunction: ()=>{
      //    set((state) => {
      //        return { curAnimation: state.animationSet.additionalAnimation };
      //    });
      // }
    };
  })
);
const useJoystickControls = /* @__PURE__ */ create(
  /* @__PURE__ */ subscribeWithSelector((set, get) => {
    return {
      /**
       * Joystick state manegement
       */
      // Initial joystick/button state
      curJoystickDis: 0,
      curJoystickAng: 0,
      curRunState: false,
      curButton1Pressed: false,
      curButton2Pressed: false,
      curButton3Pressed: false,
      curButton4Pressed: false,
      curButton5Pressed: false,
      setJoystick: (joystickDis, joystickAng, runState) => {
        set(() => {
          return {
            curJoystickDis: joystickDis,
            curJoystickAng: joystickAng,
            curRunState: runState
          };
        });
      },
      resetJoystick: () => {
        set((state) => {
          if (state.curJoystickDis !== 0 || state.curJoystickAng !== 0) {
            return {
              curJoystickDis: 0,
              curJoystickAng: 0,
              curRunState: false
            };
          }
          return {};
        });
      },
      pressButton1: () => {
        set((state) => {
          if (!state.curButton1Pressed) {
            return {
              curButton1Pressed: true
            };
          }
          return {};
        });
      },
      pressButton2: () => {
        set((state) => {
          if (!state.curButton2Pressed) {
            return {
              curButton2Pressed: true
            };
          }
          return {};
        });
      },
      pressButton3: () => {
        set((state) => {
          if (!state.curButton3Pressed) {
            return {
              curButton3Pressed: true
            };
          }
          return {};
        });
      },
      pressButton4: () => {
        set((state) => {
          if (!state.curButton4Pressed) {
            return {
              curButton4Pressed: true
            };
          }
          return {};
        });
      },
      pressButton5: () => {
        set((state) => {
          if (!state.curButton5Pressed) {
            return {
              curButton5Pressed: true
            };
          }
          return {};
        });
      },
      releaseAllButtons: () => {
        set((state) => {
          if (state.curButton1Pressed) {
            return {
              curButton1Pressed: false
            };
          }
          if (state.curButton2Pressed) {
            return {
              curButton2Pressed: false
            };
          }
          if (state.curButton3Pressed) {
            return {
              curButton3Pressed: false
            };
          }
          if (state.curButton4Pressed) {
            return {
              curButton4Pressed: false
            };
          }
          if (state.curButton5Pressed) {
            return {
              curButton5Pressed: false
            };
          }
          return {};
        });
      },
      getJoystickValues: () => {
        return {
          joystickDis: get().curJoystickDis,
          joystickAng: get().curJoystickAng,
          runState: get().curRunState,
          button1Pressed: get().curButton1Pressed,
          button2Pressed: get().curButton2Pressed,
          button3Pressed: get().curButton3Pressed,
          button4Pressed: get().curButton4Pressed,
          button5Pressed: get().curButton5Pressed
        };
      }
    };
  })
);
function EcctrlAnimation(props) {
  const group = useRef();
  const { animations } = useGLTF(props.characterURL);
  const { actions } = useAnimations(animations, group);
  const curAnimation = useGame((state) => state.curAnimation);
  const resetAnimation = useGame((state) => state.reset);
  const initializeAnimationSet = useGame(
    (state) => state.initializeAnimationSet
  );
  useEffect(() => {
    initializeAnimationSet(props.animationSet);
  }, []);
  useEffect(() => {
    const action = actions[curAnimation ? curAnimation : props.animationSet.jumpIdle];
    if (curAnimation === props.animationSet.jump || curAnimation === props.animationSet.jumpLand || curAnimation === props.animationSet.action1 || curAnimation === props.animationSet.action2 || curAnimation === props.animationSet.action3 || curAnimation === props.animationSet.action4) {
      action.reset().fadeIn(0.2).setLoop(THREE.LoopOnce, void 0).play();
      action.clampWhenFinished = true;
    } else {
      action.reset().fadeIn(0.2).play();
    }
    action._mixer.addEventListener("finished", () => resetAnimation());
    return () => {
      action.fadeOut(0.2);
      action._mixer.removeEventListener(
        "finished",
        () => resetAnimation()
      );
      action._mixer._listeners = [];
    };
  }, [curAnimation]);
  return /* @__PURE__ */ jsx(Suspense, { fallback: null, children: /* @__PURE__ */ jsx("group", { ref: group, dispose: null, userData: { camExcludeCollision: true }, children: props.children }) });
}
const JoystickComponents = (props) => {
  let joystickCenterX = 0;
  let joystickCenterY = 0;
  let joystickHalfWidth = 0;
  let joystickHalfHeight = 0;
  let joystickMaxDis = 0;
  let joystickDis = 0;
  let joystickAng = 0;
  const touch1MovementVec2 = useMemo(() => new THREE.Vector2(), []);
  const joystickMovementVec2 = useMemo(() => new THREE.Vector2(), []);
  const [windowSize, setWindowSize] = useState({ innerHeight, innerWidth });
  const joystickDiv = document.querySelector("#ecctrl-joystick");
  const [springs, api] = useSpring(
    () => ({
      topRotationX: 0,
      topRotationY: 0,
      basePositionX: 0,
      basePositionY: 0,
      config: {
        tension: 600
      }
    })
  );
  const joystickBaseGeo = useMemo(() => new THREE.CylinderGeometry(2.3, 2.1, 0.3, 16), []);
  const joystickStickGeo = useMemo(() => new THREE.CylinderGeometry(0.3, 0.3, 3, 6), []);
  const joystickHandleGeo = useMemo(() => new THREE.SphereGeometry(1.4, 8, 8), []);
  const joystickBaseMaterial = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.3 }), []);
  const joystickStickMaterial = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.3 }), []);
  const joystickHandleMaterial = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.7 }), []);
  const setJoystick = useJoystickControls((state) => state.setJoystick);
  const resetJoystick = useJoystickControls((state) => state.resetJoystick);
  const onTouchMove = useCallback((e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const touch1 = e.targetTouches[0];
    const touch1MovementX = touch1.pageX - joystickCenterX;
    const touch1MovementY = -(touch1.pageY - joystickCenterY);
    touch1MovementVec2.set(touch1MovementX, touch1MovementY);
    joystickDis = Math.min(Math.sqrt(Math.pow(touch1MovementX, 2) + Math.pow(touch1MovementY, 2)), joystickMaxDis);
    joystickAng = touch1MovementVec2.angle();
    joystickMovementVec2.set(joystickDis * Math.cos(joystickAng), joystickDis * Math.sin(joystickAng));
    const runState = joystickDis > joystickMaxDis * 0.7;
    api.start({
      topRotationX: -joystickMovementVec2.y / joystickHalfHeight,
      topRotationY: joystickMovementVec2.x / joystickHalfWidth,
      basePositionX: joystickMovementVec2.x * 2e-3,
      basePositionY: joystickMovementVec2.y * 2e-3
    });
    setJoystick(joystickDis, joystickAng, runState);
  }, [api, windowSize]);
  const onTouchEnd = (e) => {
    api.start({
      topRotationX: 0,
      topRotationY: 0,
      basePositionX: 0,
      basePositionY: 0
    });
    resetJoystick();
  };
  useEffect(() => {
    const joystickPositionX = joystickDiv.getBoundingClientRect().x;
    const joystickPositionY = joystickDiv.getBoundingClientRect().y;
    joystickHalfWidth = joystickDiv.getBoundingClientRect().width / 2;
    joystickHalfHeight = joystickDiv.getBoundingClientRect().height / 2;
    joystickMaxDis = joystickHalfWidth * 0.65;
    joystickCenterX = joystickPositionX + joystickHalfWidth;
    joystickCenterY = joystickPositionY + joystickHalfHeight;
    joystickDiv.addEventListener("touchmove", onTouchMove, { passive: false });
    joystickDiv.addEventListener("touchend", onTouchEnd);
    window.addEventListener("resize", () => {
      setWindowSize({ innerHeight: window.innerHeight, innerWidth: window.innerWidth });
    });
    return () => {
      joystickDiv.removeEventListener("touchmove", onTouchMove);
      joystickDiv.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", () => {
      });
    };
  });
  return /* @__PURE__ */ jsxs(Suspense, { fallback: "null", children: [
    /* @__PURE__ */ jsx(animated.group, { "position-x": springs.basePositionX, "position-y": springs.basePositionY, children: /* @__PURE__ */ jsx("mesh", { geometry: joystickBaseGeo, material: joystickBaseMaterial, rotation: [-Math.PI / 2, 0, 0], ...props.joystickBaseProps }) }),
    /* @__PURE__ */ jsxs(animated.group, { "rotation-x": springs.topRotationX, "rotation-y": springs.topRotationY, children: [
      /* @__PURE__ */ jsx("mesh", { geometry: joystickStickGeo, material: joystickStickMaterial, rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 1.5], ...props.joystickStickProps }),
      /* @__PURE__ */ jsx("mesh", { geometry: joystickHandleGeo, material: joystickHandleMaterial, position: [0, 0, 4], ...props.joystickHandleProps })
    ] })
  ] });
};
const ButtonComponents = ({ buttonNumber = 1, ...props }) => {
  const buttonLargeBaseGeo = useMemo(() => new THREE.CylinderGeometry(1.1, 1, 0.3, 16), []);
  const buttonSmallBaseGeo = useMemo(() => new THREE.CylinderGeometry(0.9, 0.8, 0.3, 16), []);
  const buttonTop1Geo = useMemo(() => new THREE.CylinderGeometry(0.9, 0.9, 0.5, 16), []);
  const buttonTop2Geo = useMemo(() => new THREE.CylinderGeometry(0.9, 0.9, 0.5, 16), []);
  const buttonTop3Geo = useMemo(() => new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16), []);
  const buttonTop4Geo = useMemo(() => new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16), []);
  const buttonTop5Geo = useMemo(() => new THREE.CylinderGeometry(0.7, 0.7, 0.5, 16), []);
  const buttonBaseMaterial = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.3 }), []);
  const buttonTop1Material = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5 }), []);
  const buttonTop2Material = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5 }), []);
  const buttonTop3Material = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5 }), []);
  const buttonTop4Material = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5 }), []);
  const buttonTop5Material = useMemo(() => new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5 }), []);
  const buttonDiv = document.querySelector("#ecctrl-button");
  const [springs, api] = useSpring(
    () => ({
      buttonTop1BaseScaleY: 1,
      buttonTop1BaseScaleXAndZ: 1,
      buttonTop2BaseScaleY: 1,
      buttonTop2BaseScaleXAndZ: 1,
      buttonTop3BaseScaleY: 1,
      buttonTop3BaseScaleXAndZ: 1,
      buttonTop4BaseScaleY: 1,
      buttonTop4BaseScaleXAndZ: 1,
      buttonTop5BaseScaleY: 1,
      buttonTop5BaseScaleXAndZ: 1,
      config: {
        tension: 600
      }
    })
  );
  const pressButton1 = useJoystickControls((state) => state.pressButton1);
  const pressButton2 = useJoystickControls((state) => state.pressButton2);
  const pressButton3 = useJoystickControls((state) => state.pressButton3);
  const pressButton4 = useJoystickControls((state) => state.pressButton4);
  const pressButton5 = useJoystickControls((state) => state.pressButton5);
  const releaseAllButtons = useJoystickControls((state) => state.releaseAllButtons);
  const onPointerDown = (number) => {
    switch (number) {
      case 1:
        pressButton1();
        api.start({
          buttonTop1BaseScaleY: 0.5,
          buttonTop1BaseScaleXAndZ: 1.15
        });
        break;
      case 2:
        pressButton2();
        api.start({
          buttonTop2BaseScaleY: 0.5,
          buttonTop2BaseScaleXAndZ: 1.15
        });
        break;
      case 3:
        pressButton3();
        api.start({
          buttonTop3BaseScaleY: 0.5,
          buttonTop3BaseScaleXAndZ: 1.15
        });
        break;
      case 4:
        pressButton4();
        api.start({
          buttonTop4BaseScaleY: 0.5,
          buttonTop4BaseScaleXAndZ: 1.15
        });
        break;
      case 5:
        pressButton5();
        api.start({
          buttonTop5BaseScaleY: 0.5,
          buttonTop5BaseScaleXAndZ: 1.15
        });
        break;
    }
  };
  const onPointerUp = () => {
    releaseAllButtons();
    api.start({
      buttonTop1BaseScaleY: 1,
      buttonTop1BaseScaleXAndZ: 1,
      buttonTop2BaseScaleY: 1,
      buttonTop2BaseScaleXAndZ: 1,
      buttonTop3BaseScaleY: 1,
      buttonTop3BaseScaleXAndZ: 1,
      buttonTop4BaseScaleY: 1,
      buttonTop4BaseScaleXAndZ: 1,
      buttonTop5BaseScaleY: 1,
      buttonTop5BaseScaleXAndZ: 1
    });
  };
  useEffect(() => {
    buttonDiv.addEventListener("pointerup", onPointerUp);
    return () => {
      buttonDiv.removeEventListener("pointerup", onPointerUp);
    };
  });
  return /* @__PURE__ */ jsxs(Suspense, { fallback: "null", children: [
    buttonNumber > 0 && /* @__PURE__ */ jsxs(
      animated.group,
      {
        "scale-x": springs.buttonTop1BaseScaleXAndZ,
        "scale-y": springs.buttonTop1BaseScaleY,
        "scale-z": springs.buttonTop1BaseScaleXAndZ,
        rotation: [-Math.PI / 2, 0, 0],
        position: props.buttonGroup1Position || (buttonNumber === 1 ? [0, 0, 0] : [2, 1, 0]),
        children: [
          /* @__PURE__ */ jsx("mesh", { geometry: buttonLargeBaseGeo, material: buttonBaseMaterial, ...props.buttonLargeBaseProps, onPointerDown: () => onPointerDown(1) }),
          /* @__PURE__ */ jsx("mesh", { geometry: buttonTop1Geo, material: buttonTop1Material, position: [0, -0.3, 0], ...props.buttonTop1Props })
        ]
      }
    ),
    buttonNumber > 1 && /* @__PURE__ */ jsxs(
      animated.group,
      {
        "scale-x": springs.buttonTop2BaseScaleXAndZ,
        "scale-y": springs.buttonTop2BaseScaleY,
        "scale-z": springs.buttonTop2BaseScaleXAndZ,
        rotation: [-Math.PI / 2, 0, 0],
        position: props.buttonGroup2Position || [0.5, -1.3, 0],
        children: [
          /* @__PURE__ */ jsx("mesh", { geometry: buttonLargeBaseGeo, material: buttonBaseMaterial, ...props.buttonLargeBaseProps, onPointerDown: () => onPointerDown(2) }),
          /* @__PURE__ */ jsx("mesh", { geometry: buttonTop2Geo, material: buttonTop2Material, position: [0, -0.3, 0], ...props.buttonTop2Props })
        ]
      }
    ),
    buttonNumber > 2 && /* @__PURE__ */ jsxs(
      animated.group,
      {
        "scale-x": springs.buttonTop3BaseScaleXAndZ,
        "scale-y": springs.buttonTop3BaseScaleY,
        "scale-z": springs.buttonTop3BaseScaleXAndZ,
        rotation: [-Math.PI / 2, 0, 0],
        position: props.buttonGroup3Position || [-1, 1, 0],
        children: [
          /* @__PURE__ */ jsx("mesh", { geometry: buttonSmallBaseGeo, material: buttonBaseMaterial, ...props.buttonSmallBaseProps, onPointerDown: () => onPointerDown(3) }),
          /* @__PURE__ */ jsx("mesh", { geometry: buttonTop3Geo, material: buttonTop3Material, position: [0, -0.3, 0], ...props.buttonTop3Props })
        ]
      }
    ),
    buttonNumber > 3 && /* @__PURE__ */ jsxs(
      animated.group,
      {
        "scale-x": springs.buttonTop4BaseScaleXAndZ,
        "scale-y": springs.buttonTop4BaseScaleY,
        "scale-z": springs.buttonTop4BaseScaleXAndZ,
        rotation: [-Math.PI / 2, 0, 0],
        position: props.buttonGroup4Position || [-2, -1.3, 0],
        children: [
          /* @__PURE__ */ jsx("mesh", { geometry: buttonSmallBaseGeo, material: buttonBaseMaterial, ...props.buttonSmallBaseProps, onPointerDown: () => onPointerDown(4) }),
          /* @__PURE__ */ jsx("mesh", { geometry: buttonTop4Geo, material: buttonTop4Material, position: [0, -0.3, 0], ...props.buttonTop4Props })
        ]
      }
    ),
    buttonNumber > 4 && /* @__PURE__ */ jsxs(
      animated.group,
      {
        "scale-x": springs.buttonTop5BaseScaleXAndZ,
        "scale-y": springs.buttonTop5BaseScaleY,
        "scale-z": springs.buttonTop5BaseScaleXAndZ,
        rotation: [-Math.PI / 2, 0, 0],
        position: props.buttonGroup5Position || [0.4, 2.9, 0],
        children: [
          /* @__PURE__ */ jsx("mesh", { geometry: buttonSmallBaseGeo, material: buttonBaseMaterial, ...props.buttonSmallBaseProps, onPointerDown: () => onPointerDown(5) }),
          /* @__PURE__ */ jsx("mesh", { geometry: buttonTop5Geo, material: buttonTop5Material, position: [0, -0.3, 0], ...props.buttonTop5Props })
        ]
      }
    )
  ] });
};
const EcctrlJoystick = forwardRef((props, ref) => {
  const joystickWrapperStyle = {
    userSelect: "none",
    MozUserSelect: "none",
    WebkitUserSelect: "none",
    msUserSelect: "none",
    position: "fixed",
    zIndex: "9999",
    height: props.joystickHeightAndWidth || "200px",
    width: props.joystickHeightAndWidth || "200px",
    left: props.joystickPositionLeft || "0",
    bottom: props.joystickPositionBottom || "0"
  };
  const buttonWrapperStyle = {
    userSelect: "none",
    MozUserSelect: "none",
    WebkitUserSelect: "none",
    msUserSelect: "none",
    position: "fixed",
    zIndex: "9999",
    height: props.buttonHeightAndWidth || "200px",
    width: props.buttonHeightAndWidth || "200px",
    right: props.buttonPositionRight || "0",
    bottom: props.buttonPositionBottom || "0"
  };
  return /* @__PURE__ */ jsxs("div", { ref, children: [
    /* @__PURE__ */ jsx("div", { id: "ecctrl-joystick", style: joystickWrapperStyle, onContextMenu: (e) => e.preventDefault(), children: /* @__PURE__ */ jsxs(
      Canvas,
      {
        shadows: true,
        orthographic: true,
        camera: {
          zoom: props.joystickCamZoom || 26,
          position: props.joystickCamPosition || [0, 0, 50]
        },
        children: [
          /* @__PURE__ */ jsx(JoystickComponents, { ...props }),
          props.children
        ]
      }
    ) }),
    /* @__PURE__ */ jsx("div", { id: "ecctrl-button", style: buttonWrapperStyle, onContextMenu: (e) => e.preventDefault(), children: /* @__PURE__ */ jsxs(
      Canvas,
      {
        shadows: true,
        orthographic: true,
        camera: {
          zoom: props.buttonCamZoom || 26,
          position: props.buttonCamPosition || [0, 0, 50]
        },
        children: [
          /* @__PURE__ */ jsx(ButtonComponents, { ...props }),
          props.children
        ]
      }
    ) })
  ] });
});
const getMovingDirection = (forward, backward, leftward, rightward, pivot) => {
  if (!forward && !backward && !leftward && !rightward)
    return null;
  if (forward && leftward)
    return pivot.rotation.y + Math.PI / 4;
  if (forward && rightward)
    return pivot.rotation.y - Math.PI / 4;
  if (backward && leftward)
    return pivot.rotation.y - Math.PI / 4 + Math.PI;
  if (backward && rightward)
    return pivot.rotation.y + Math.PI / 4 + Math.PI;
  if (backward)
    return pivot.rotation.y + Math.PI;
  if (leftward)
    return pivot.rotation.y + Math.PI / 2;
  if (rightward)
    return pivot.rotation.y - Math.PI / 2;
  if (forward)
    return pivot.rotation.y;
};
const Ecctrl = forwardRef(({
  children,
  debug = false,
  capsuleHalfHeight = 0.35,
  capsuleRadius = 0.3,
  floatHeight = 0.3,
  characterInitDir = 0,
  // in rad
  followLight = false,
  // Follow camera setups
  camInitDis = -5,
  camMaxDis = -7,
  camMinDis = -0.7,
  camInitDir = { x: 0, y: 0, z: 0 },
  // in rad
  camTargetPos = { x: 0, y: 0, z: 0 },
  camMoveSpeed = 1,
  camZoomSpeed = 1,
  camCollision = true,
  camCollisionOffset = 0.7,
  collisionGroups = 0,
  // Follow light setups
  followLightPos = { x: 20, y: 30, z: 10 },
  // Base control setups
  maxVelLimit = 2.5,
  turnVelMultiplier = 0.2,
  turnSpeed = 15,
  sprintMult = 2,
  jumpVel = 4,
  jumpForceToGroundMult = 5,
  slopJumpMult = 0.25,
  sprintJumpMult = 1.2,
  airDragMultiplier = 0.2,
  dragDampingC = 0.15,
  accDeltaTime = 8,
  rejectVelMult = 4,
  moveImpulsePointY = 0.5,
  camFollowMult = 11,
  fallingGravityScale = 2.5,
  fallingMaxVel = -20,
  wakeUpDelay = 200,
  // Floating Ray setups
  rayOriginOffest = { x: 0, y: -capsuleHalfHeight, z: 0 },
  rayHitForgiveness = 0.1,
  rayLength = capsuleRadius + 2,
  rayDir = { x: 0, y: -1, z: 0 },
  floatingDis = capsuleRadius + floatHeight,
  springK = 1.2,
  dampingC = 0.08,
  // Slope Ray setups
  showSlopeRayOrigin = false,
  slopeMaxAngle = 1,
  // in rad
  slopeRayOriginOffest = capsuleRadius - 0.03,
  slopeRayLength = capsuleRadius + 3,
  slopeRayDir = { x: 0, y: -1, z: 0 },
  slopeUpExtraForce = 0.1,
  slopeDownExtraForce = 0.2,
  // AutoBalance Force setups
  autoBalance = true,
  autoBalanceSpringK = 0.3,
  autoBalanceDampingC = 0.03,
  autoBalanceSpringOnY = 0.3,
  autoBalanceDampingOnY = 0.02,
  // Animation temporary setups
  animated: animated2 = false,
  // Other rigibody props from parent
  ...props
}, ref) => {
  const characterRef = ref || useRef();
  const characterModelRef = useRef();
  const modelFacingVec = useMemo(() => new THREE.Vector3(), []);
  const bodyFacingVec = useMemo(() => new THREE.Vector3(), []);
  const bodyBalanceVec = useMemo(() => new THREE.Vector3(), []);
  const bodyBalanceVecOnX = useMemo(() => new THREE.Vector3(), []);
  const bodyFacingVecOnY = useMemo(() => new THREE.Vector3(), []);
  const bodyBalanceVecOnZ = useMemo(() => new THREE.Vector3(), []);
  const vectorY = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const vectorZ = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const idleAnimation = !animated2 ? null : useGame((state) => state.idle);
  const walkAnimation = !animated2 ? null : useGame((state) => state.walk);
  const runAnimation = !animated2 ? null : useGame((state) => state.run);
  const jumpAnimation = !animated2 ? null : useGame((state) => state.jump);
  const jumpIdleAnimation = !animated2 ? null : useGame((state) => state.jumpIdle);
  const fallAnimation = !animated2 ? null : useGame((state) => state.fall);
  const action1Animation = !animated2 ? null : useGame((state) => state.action1);
  const action2Animation = !animated2 ? null : useGame((state) => state.action2);
  const action3Animation = !animated2 ? null : useGame((state) => state.action3);
  const action4Animation = !animated2 ? null : useGame((state) => state.action4);
  let characterControlsDebug = null;
  let floatingRayDebug = null;
  let slopeRayDebug = null;
  let autoBalanceForceDebug = null;
  if (debug) {
    characterControlsDebug = useControls(
      "Character Controls",
      {
        maxVelLimit: {
          value: maxVelLimit,
          min: 0,
          max: 10,
          step: 0.01
        },
        turnVelMultiplier: {
          value: turnVelMultiplier,
          min: 0,
          max: 1,
          step: 0.01
        },
        turnSpeed: {
          value: turnSpeed,
          min: 5,
          max: 30,
          step: 0.1
        },
        sprintMult: {
          value: sprintMult,
          min: 1,
          max: 5,
          step: 0.01
        },
        jumpVel: {
          value: jumpVel,
          min: 0,
          max: 10,
          step: 0.01
        },
        jumpForceToGroundMult: {
          value: jumpForceToGroundMult,
          min: 0,
          max: 80,
          step: 0.1
        },
        slopJumpMult: {
          value: slopJumpMult,
          min: 0,
          max: 1,
          step: 0.01
        },
        sprintJumpMult: {
          value: sprintJumpMult,
          min: 1,
          max: 3,
          step: 0.01
        },
        airDragMultiplier: {
          value: airDragMultiplier,
          min: 0,
          max: 1,
          step: 0.01
        },
        dragDampingC: {
          value: dragDampingC,
          min: 0,
          max: 0.5,
          step: 0.01
        },
        accDeltaTime: {
          value: accDeltaTime,
          min: 0,
          max: 50,
          step: 1
        },
        rejectVelMult: {
          value: rejectVelMult,
          min: 0,
          max: 10,
          step: 0.1
        },
        moveImpulsePointY: {
          value: moveImpulsePointY,
          min: 0,
          max: 3,
          step: 0.1
        },
        camFollowMult: {
          value: camFollowMult,
          min: 0,
          max: 15,
          step: 0.1
        }
      },
      { collapsed: true }
    );
    maxVelLimit = characterControlsDebug.maxVelLimit;
    turnVelMultiplier = characterControlsDebug.turnVelMultiplier;
    turnSpeed = characterControlsDebug.turnSpeed;
    sprintMult = characterControlsDebug.sprintMult;
    jumpVel = characterControlsDebug.jumpVel;
    jumpForceToGroundMult = characterControlsDebug.jumpForceToGroundMult;
    slopJumpMult = characterControlsDebug.slopJumpMult;
    sprintJumpMult = characterControlsDebug.sprintJumpMult;
    airDragMultiplier = characterControlsDebug.airDragMultiplier;
    dragDampingC = characterControlsDebug.dragDampingC;
    accDeltaTime = characterControlsDebug.accDeltaTime;
    rejectVelMult = characterControlsDebug.rejectVelMult;
    moveImpulsePointY = characterControlsDebug.moveImpulsePointY;
    camFollowMult = characterControlsDebug.camFollowMult;
    floatingRayDebug = useControls(
      "Floating Ray",
      {
        rayOriginOffest: {
          x: 0,
          y: -capsuleHalfHeight,
          z: 0
        },
        rayHitForgiveness: {
          value: rayHitForgiveness,
          min: 0,
          max: 0.5,
          step: 0.01
        },
        rayLength: {
          value: capsuleRadius + 2,
          min: 0,
          max: capsuleRadius + 10,
          step: 0.01
        },
        rayDir: { x: 0, y: -1, z: 0 },
        floatingDis: {
          value: capsuleRadius + floatHeight,
          min: 0,
          max: capsuleRadius + 2,
          step: 0.01
        },
        springK: {
          value: springK,
          min: 0,
          max: 5,
          step: 0.01
        },
        dampingC: {
          value: dampingC,
          min: 0,
          max: 3,
          step: 0.01
        }
      },
      { collapsed: true }
    );
    rayOriginOffest = floatingRayDebug.rayOriginOffest;
    rayHitForgiveness = floatingRayDebug.rayHitForgiveness;
    rayLength = floatingRayDebug.rayLength;
    rayDir = floatingRayDebug.rayDir;
    floatingDis = floatingRayDebug.floatingDis;
    springK = floatingRayDebug.springK;
    dampingC = floatingRayDebug.dampingC;
    slopeRayDebug = useControls(
      "Slope Ray",
      {
        showSlopeRayOrigin: false,
        slopeMaxAngle: {
          value: slopeMaxAngle,
          min: 0,
          max: 1.57,
          step: 0.01
        },
        slopeRayOriginOffest: {
          value: capsuleRadius,
          min: 0,
          max: capsuleRadius + 3,
          step: 0.01
        },
        slopeRayLength: {
          value: capsuleRadius + 3,
          min: 0,
          max: capsuleRadius + 13,
          step: 0.01
        },
        slopeRayDir: { x: 0, y: -1, z: 0 },
        slopeUpExtraForce: {
          value: slopeUpExtraForce,
          min: 0,
          max: 5,
          step: 0.01
        },
        slopeDownExtraForce: {
          value: slopeDownExtraForce,
          min: 0,
          max: 5,
          step: 0.01
        }
      },
      { collapsed: true }
    );
    showSlopeRayOrigin = slopeRayDebug.showSlopeRayOrigin;
    slopeMaxAngle = slopeRayDebug.slopeMaxAngle;
    slopeRayLength = slopeRayDebug.slopeRayLength;
    slopeRayDir = slopeRayDebug.slopeRayDir;
    slopeUpExtraForce = slopeRayDebug.slopeUpExtraForce;
    slopeDownExtraForce = slopeRayDebug.slopeDownExtraForce;
    autoBalanceForceDebug = useControls(
      "AutoBalance Force",
      {
        autoBalance: {
          value: true
        },
        autoBalanceSpringK: {
          value: autoBalanceSpringK,
          min: 0,
          max: 5,
          step: 0.01
        },
        autoBalanceDampingC: {
          value: autoBalanceDampingC,
          min: 0,
          max: 0.1,
          step: 1e-3
        },
        autoBalanceSpringOnY: {
          value: autoBalanceSpringOnY,
          min: 0,
          max: 5,
          step: 0.01
        },
        autoBalanceDampingOnY: {
          value: autoBalanceDampingOnY,
          min: 0,
          max: 0.1,
          step: 1e-3
        }
      },
      { collapsed: true }
    );
    autoBalance = autoBalanceForceDebug.autoBalance;
    autoBalanceSpringK = autoBalanceForceDebug.autoBalanceSpringK;
    autoBalanceDampingC = autoBalanceForceDebug.autoBalanceDampingC;
    autoBalanceSpringOnY = autoBalanceForceDebug.autoBalanceSpringOnY;
    autoBalanceDampingOnY = autoBalanceForceDebug.autoBalanceDampingOnY;
  }
  const [subscribeKeys, getKeys] = useKeyboardControls();
  const { rapier, world } = useRapier();
  const getJoystickValues = useJoystickControls((state) => state.getJoystickValues);
  let canJump = false;
  let isFalling = false;
  const initialGravityScale = useMemo(() => props.gravityScale || 1, []);
  let isOnMovingObject = false;
  const standingForcePoint = useMemo(() => new THREE.Vector3(), []);
  const movingObjectDragForce = useMemo(() => new THREE.Vector3(), []);
  const movingObjectVelocity = useMemo(() => new THREE.Vector3(), []);
  const movingObjectVelocityInCharacterDir = useMemo(
    () => new THREE.Vector3(),
    []
  );
  const distanceFromCharacterToObject = useMemo(() => new THREE.Vector3(), []);
  const objectAngvelToLinvel = useMemo(() => new THREE.Vector3(), []);
  let dirLight = null;
  const cameraSetups = {
    camInitDis,
    camMaxDis,
    camMinDis,
    camMoveSpeed,
    camZoomSpeed,
    camCollisionOffset
  };
  const { pivot, cameraCollisionDetect } = useFollowCam(cameraSetups);
  const pivotPosition = useMemo(() => new THREE.Vector3(), []);
  const modelEuler = useMemo(() => new THREE.Euler(), []);
  const modelQuat = useMemo(() => new THREE.Quaternion(), []);
  const moveImpulse = useMemo(() => new THREE.Vector3(), []);
  const movingDirection = useMemo(() => new THREE.Vector3(), []);
  const moveAccNeeded = useMemo(() => new THREE.Vector3(), []);
  const jumpVelocityVec = useMemo(() => new THREE.Vector3(), []);
  const jumpDirection = useMemo(() => new THREE.Vector3(), []);
  const currentVel = useMemo(() => new THREE.Vector3(), []);
  const currentPos = useMemo(() => new THREE.Vector3(), []);
  const dragForce = useMemo(() => new THREE.Vector3(), []);
  const dragAngForce = useMemo(() => new THREE.Vector3(), []);
  const wantToMoveVel = useMemo(() => new THREE.Vector3(), []);
  const rejectVel = useMemo(() => new THREE.Vector3(), []);
  let floatingForce = null;
  const springDirVec = useMemo(() => new THREE.Vector3(), []);
  const characterMassForce = useMemo(() => new THREE.Vector3(), []);
  const rayOrigin = useMemo(() => new THREE.Vector3(), []);
  const rayCast = new rapier.Ray(rayOrigin, rayDir);
  let rayHit = null;
  let slopeAngle = null;
  let actualSlopeNormal = null;
  let actualSlopeAngle = null;
  const actualSlopeNormalVec = useMemo(() => new THREE.Vector3(), []);
  const floorNormal = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const slopeRayOriginRef = useRef();
  const slopeRayorigin = useMemo(() => new THREE.Vector3(), []);
  const slopeRayCast = new rapier.Ray(slopeRayorigin, slopeRayDir);
  let slopeRayHit = null;
  const moveCharacter = (_, run, slopeAngle2, movingObjectVelocity2) => {
    if (actualSlopeAngle < slopeMaxAngle && Math.abs(slopeAngle2) > 0.2 && Math.abs(slopeAngle2) < slopeMaxAngle) {
      movingDirection.set(0, Math.sin(slopeAngle2), Math.cos(slopeAngle2));
    } else if (actualSlopeAngle >= slopeMaxAngle) {
      movingDirection.set(
        0,
        Math.sin(slopeAngle2) > 0 ? 0 : Math.sin(slopeAngle2),
        Math.sin(slopeAngle2) > 0 ? 0.1 : 1
      );
    } else {
      movingDirection.set(0, 0, 1);
    }
    movingDirection.applyQuaternion(characterModelRef.current.quaternion);
    movingObjectVelocityInCharacterDir.copy(movingObjectVelocity2).projectOnVector(movingDirection).multiply(movingDirection);
    const angleBetweenCharacterDirAndObjectDir = movingObjectVelocity2.angleTo(movingDirection);
    const wantToMoveMeg = currentVel.dot(movingDirection);
    wantToMoveVel.set(
      movingDirection.x * wantToMoveMeg,
      0,
      movingDirection.z * wantToMoveMeg
    );
    rejectVel.copy(currentVel).sub(wantToMoveVel);
    moveAccNeeded.set(
      (movingDirection.x * (maxVelLimit * (run ? sprintMult : 1) + movingObjectVelocityInCharacterDir.x) - (currentVel.x - movingObjectVelocity2.x * Math.sin(angleBetweenCharacterDirAndObjectDir) + rejectVel.x * (isOnMovingObject ? 0 : rejectVelMult))) / accDeltaTime,
      0,
      (movingDirection.z * (maxVelLimit * (run ? sprintMult : 1) + movingObjectVelocityInCharacterDir.z) - (currentVel.z - movingObjectVelocity2.z * Math.sin(angleBetweenCharacterDirAndObjectDir) + rejectVel.z * (isOnMovingObject ? 0 : rejectVelMult))) / accDeltaTime
    );
    const moveForceNeeded = moveAccNeeded.multiplyScalar(
      characterRef.current.mass()
    );
    const characterRotated = Math.sin(characterModelRef.current.rotation.y).toFixed(3) == Math.sin(modelEuler.y).toFixed(3);
    if (!characterRotated) {
      moveImpulse.set(
        moveForceNeeded.x * turnVelMultiplier * (canJump ? 1 : airDragMultiplier),
        // if it's in the air, give it less control
        slopeAngle2 === null || slopeAngle2 == 0 ? 0 : movingDirection.y * turnVelMultiplier * (movingDirection.y > 0 ? slopeUpExtraForce : slopeDownExtraForce) * (run ? sprintMult : 1),
        moveForceNeeded.z * turnVelMultiplier * (canJump ? 1 : airDragMultiplier)
        // if it's in the air, give it less control
      );
    } else {
      moveImpulse.set(
        moveForceNeeded.x * (canJump ? 1 : airDragMultiplier),
        slopeAngle2 === null || slopeAngle2 == 0 ? 0 : movingDirection.y * (movingDirection.y > 0 ? slopeUpExtraForce : slopeDownExtraForce) * (run ? sprintMult : 1),
        moveForceNeeded.z * (canJump ? 1 : airDragMultiplier)
      );
    }
    characterRef.current.applyImpulseAtPoint(
      moveImpulse,
      {
        x: currentPos.x,
        y: currentPos.y + moveImpulsePointY,
        z: currentPos.z
      },
      true
    );
  };
  const autoBalanceCharacter = () => {
    bodyFacingVec.set(0, 0, 1).applyQuaternion(quat(characterRef.current.rotation()));
    bodyBalanceVec.set(0, 1, 0).applyQuaternion(quat(characterRef.current.rotation()));
    bodyBalanceVecOnX.set(0, bodyBalanceVec.y, bodyBalanceVec.z);
    bodyFacingVecOnY.set(bodyFacingVec.x, 0, bodyFacingVec.z);
    bodyBalanceVecOnZ.set(bodyBalanceVec.x, bodyBalanceVec.y, 0);
    characterModelRef.current.getWorldDirection(modelFacingVec);
    const crossVecOnX = vectorY.clone().cross(bodyBalanceVecOnX);
    const crossVecOnY = vectorZ.clone().cross(bodyFacingVecOnY);
    const crossVecOnZ = vectorY.clone().cross(bodyBalanceVecOnZ);
    dragAngForce.set(
      (crossVecOnX.x < 0 ? 1 : -1) * autoBalanceSpringK * bodyBalanceVecOnX.angleTo(vectorY) - characterRef.current.angvel().x * autoBalanceDampingC,
      (crossVecOnY.y < 0 ? 1 : -1) * autoBalanceSpringOnY * bodyFacingVecOnY.angleTo(vectorZ) - characterRef.current.angvel().y * autoBalanceDampingOnY,
      (crossVecOnZ.z < 0 ? 1 : -1) * autoBalanceSpringK * bodyBalanceVecOnZ.angleTo(vectorY) - characterRef.current.angvel().z * autoBalanceDampingC
    );
    characterRef.current.applyTorqueImpulse(dragAngForce, false);
  };
  const sleepCharacter = () => {
    if (document.visibilityState === "hidden") {
      characterRef.current.sleep();
    } else {
      setTimeout(() => {
        characterRef.current.wakeUp();
      }, wakeUpDelay);
    }
  };
  useEffect(() => {
    if (followLight) {
      dirLight = characterModelRef.current.parent.parent.children.find(
        (item) => {
          return item.name === "followLight";
        }
      );
    }
    const unSubscribeAction1 = subscribeKeys(
      (state) => state.action1,
      (value) => {
        if (value) {
          animated2 && action1Animation();
        }
      }
    );
    const unSubscribeAction2 = subscribeKeys(
      (state) => state.action2,
      (value) => {
        if (value) {
          animated2 && action2Animation();
        }
      }
    );
    const unSubscribeAction3 = subscribeKeys(
      (state) => state.action3,
      (value) => {
        if (value) {
          animated2 && action3Animation();
        }
      }
    );
    const unSubscribeAction4 = subscribeKeys(
      (state) => state.action4,
      (value) => {
        if (value) {
          animated2 && action4Animation();
        }
      }
    );
    const unSubPressButton2 = useJoystickControls.subscribe(
      (state) => state.curButton2Pressed,
      (value) => {
        if (value) {
          animated2 && action4Animation();
        }
      }
    );
    const unSubPressButton3 = useJoystickControls.subscribe(
      (state) => state.curButton3Pressed,
      (value) => {
        if (value) {
          animated2 && action2Animation();
        }
      }
    );
    const unSubPressButton4 = useJoystickControls.subscribe(
      (state) => state.curButton4Pressed,
      (value) => {
        if (value) {
          animated2 && action3Animation();
        }
      }
    );
    const unSubPressButton5 = useJoystickControls.subscribe(
      (state) => state.curButton5Pressed,
      (value) => {
        if (value) {
          animated2 && action1Animation();
        }
      }
    );
    return () => {
      unSubscribeAction1();
      unSubscribeAction2();
      unSubscribeAction3();
      unSubscribeAction4();
      unSubPressButton2();
      unSubPressButton3();
      unSubPressButton4();
      unSubPressButton5();
    };
  });
  useEffect(() => {
    characterRef.current.setEnabledRotations(
      autoBalance ? true : false,
      autoBalance ? true : false,
      autoBalance ? true : false,
      false
    );
  }, [autoBalance]);
  useEffect(() => {
    modelEuler.y = characterInitDir;
    pivot.rotation.x = camInitDir.x;
    pivot.rotation.y = camInitDir.y;
    pivot.rotation.z = camInitDir.z;
    window.addEventListener("visibilitychange", sleepCharacter);
    return () => {
      window.removeEventListener("visibilitychange", sleepCharacter);
    };
  }, []);
  useFrame((state, delta) => {
    var _a, _b, _c;
    if (characterRef.current) {
      currentPos.copy(characterRef.current.translation());
    }
    if (followLight && dirLight) {
      dirLight.position.x = currentPos.x + followLightPos.x;
      dirLight.position.y = currentPos.y + followLightPos.y;
      dirLight.position.z = currentPos.z + followLightPos.z;
      dirLight.target = characterModelRef.current;
    }
    const {
      joystickDis,
      joystickAng,
      runState,
      button1Pressed
    } = getJoystickValues();
    if (joystickDis > 0) {
      modelEuler.y = pivot.rotation.y + (joystickAng - Math.PI / 2);
      moveCharacter(delta, runState, slopeAngle, movingObjectVelocity);
    }
    const { forward, backward, leftward, rightward, jump, run } = getKeys();
    modelEuler.y = ((movingDirection2) => movingDirection2 === null ? modelEuler.y : movingDirection2)(getMovingDirection(forward, backward, leftward, rightward, pivot));
    if (forward || backward || leftward || rightward)
      moveCharacter(delta, run, slopeAngle, movingObjectVelocity);
    if (characterRef.current) {
      currentVel.copy(characterRef.current.linvel());
    }
    if ((jump || button1Pressed) && canJump) {
      jumpVelocityVec.set(
        currentVel.x,
        run ? sprintJumpMult * jumpVel : jumpVel,
        currentVel.z
      );
      characterRef.current.setLinvel(
        jumpDirection.set(0, (run ? sprintJumpMult * jumpVel : jumpVel) * slopJumpMult, 0).projectOnVector(actualSlopeNormalVec).add(jumpVelocityVec),
        true
      );
      characterMassForce.y *= jumpForceToGroundMult;
      (_a = rayHit.collider.parent()) == null ? void 0 : _a.applyImpulseAtPoint(characterMassForce, standingForcePoint, true);
    }
    modelQuat.setFromEuler(modelEuler);
    characterModelRef.current.quaternion.rotateTowards(
      modelQuat,
      delta * turnSpeed
    );
    pivotPosition.set(
      currentPos.x + camTargetPos.x,
      currentPos.y + (camTargetPos.y || capsuleHalfHeight + capsuleRadius / 2),
      currentPos.z + camTargetPos.z
    );
    pivot.position.lerp(pivotPosition, 1 - Math.exp(-camFollowMult * delta));
    state.camera.lookAt(pivot.position);
    rayOrigin.addVectors(currentPos, rayOriginOffest);
    rayHit = world.castRay(
      rayCast,
      rayLength,
      true,
      null,
      null,
      // I have no idea
      characterRef.current,
      null,
      // this exclude with sensor collider
      (collider) => !collider.isSensor()
    );
    if (rayHit && rayHit.toi < floatingDis + rayHitForgiveness) {
      if (slopeRayHit && actualSlopeAngle < slopeMaxAngle) {
        canJump = true;
      }
    } else {
      canJump = false;
    }
    if (rayHit && canJump) {
      if (rayHit.collider.parent()) {
        standingForcePoint.set(
          rayOrigin.x,
          rayOrigin.y - rayHit.toi,
          rayOrigin.z
        );
        const rayHitObjectBodyType = rayHit.collider.parent().bodyType();
        const rayHitObjectBodyMass = rayHit.collider.parent().mass();
        if ((rayHitObjectBodyType === 0 || rayHitObjectBodyType === 2) && rayHitObjectBodyMass > 0.5) {
          isOnMovingObject = true;
          distanceFromCharacterToObject.copy(currentPos).sub(rayHit.collider.parent().translation());
          const movingObjectLinvel = rayHit.collider.parent().linvel();
          const movingObjectAngvel = rayHit.collider.parent().angvel();
          movingObjectVelocity.set(
            movingObjectLinvel.x + objectAngvelToLinvel.crossVectors(
              movingObjectAngvel,
              distanceFromCharacterToObject
            ).x,
            movingObjectLinvel.y,
            movingObjectLinvel.z + objectAngvelToLinvel.crossVectors(
              movingObjectAngvel,
              distanceFromCharacterToObject
            ).z
          );
          if (rayHitObjectBodyType === 0) {
            if (!forward && !backward && !leftward && !rightward && canJump && joystickDis === 0) {
              movingObjectDragForce.set(
                (currentVel.x - movingObjectVelocity.x) * dragDampingC,
                0,
                (currentVel.z - movingObjectVelocity.z) * dragDampingC
              );
            } else {
              movingObjectDragForce.copy(moveImpulse).negate();
            }
            rayHit.collider.parent().applyImpulseAtPoint(
              movingObjectDragForce,
              standingForcePoint,
              true
            );
          }
        } else {
          isOnMovingObject = false;
          movingObjectVelocity.set(0, 0, 0);
        }
      }
    }
    slopeRayOriginRef.current.getWorldPosition(slopeRayorigin);
    slopeRayorigin.y = rayOrigin.y;
    slopeRayHit = world.castRay(
      slopeRayCast,
      slopeRayLength,
      true,
      null,
      null,
      // Still no idea
      characterRef.current,
      null,
      // this exclude with sensor collider
      (collider) => !collider.isSensor()
    );
    if (slopeRayHit) {
      actualSlopeNormal = (_b = slopeRayHit.collider.castRayAndGetNormal(
        slopeRayCast,
        slopeRayLength,
        false
      )) == null ? void 0 : _b.normal;
      if (actualSlopeNormal) {
        actualSlopeNormalVec == null ? void 0 : actualSlopeNormalVec.set(
          actualSlopeNormal.x,
          actualSlopeNormal.y,
          actualSlopeNormal.z
        );
        actualSlopeAngle = actualSlopeNormalVec == null ? void 0 : actualSlopeNormalVec.angleTo(floorNormal);
      }
    }
    if (slopeRayHit && rayHit && slopeRayHit.toi < floatingDis + 0.5) {
      if (canJump) {
        slopeAngle = Number(
          Math.atan(
            (rayHit.toi - slopeRayHit.toi) / slopeRayOriginOffest
          ).toFixed(2)
        );
      } else {
        slopeAngle = null;
      }
    } else {
      slopeAngle = null;
    }
    if (rayHit != null) {
      if (canJump && rayHit.collider.parent()) {
        floatingForce = springK * (floatingDis - rayHit.toi) - characterRef.current.linvel().y * dampingC;
        characterRef.current.applyImpulse(
          springDirVec.set(0, floatingForce, 0),
          false
        );
        characterMassForce.set(0, floatingForce > 0 ? -floatingForce : 0, 0);
        (_c = rayHit.collider.parent()) == null ? void 0 : _c.applyImpulseAtPoint(characterMassForce, standingForcePoint, true);
      }
    }
    if (!forward && !backward && !leftward && !rightward && canJump && joystickDis === 0) {
      if (!isOnMovingObject) {
        dragForce.set(
          -currentVel.x * dragDampingC,
          0,
          -currentVel.z * dragDampingC
        );
        characterRef.current.applyImpulse(dragForce, false);
      } else {
        dragForce.set(
          (movingObjectVelocity.x - currentVel.x) * dragDampingC * 2,
          0,
          (movingObjectVelocity.z - currentVel.z) * dragDampingC * 2
        );
        characterRef.current.applyImpulse(dragForce, true);
      }
    }
    isFalling = currentVel.y < 0 && !canJump ? true : false;
    if (characterRef.current) {
      if (currentVel.y < fallingMaxVel && characterRef.current.gravityScale() !== 0) {
        characterRef.current.setGravityScale(0, true);
      } else if (isFalling && characterRef.current.gravityScale() !== fallingGravityScale) {
        characterRef.current.setGravityScale(fallingGravityScale, true);
      } else if (!isFalling && characterRef.current.gravityScale() !== initialGravityScale) {
        characterRef.current.setGravityScale(initialGravityScale, true);
      }
    }
    if (autoBalance && characterRef.current) {
      autoBalanceCharacter();
    }
    camCollision && cameraCollisionDetect(delta);
    if (animated2) {
      if (!forward && !backward && !leftward && !rightward && !jump && !button1Pressed && joystickDis === 0 && canJump) {
        idleAnimation();
      } else if ((jump || button1Pressed) && canJump) {
        jumpAnimation();
      } else if (canJump && (forward || backward || leftward || rightward || joystickDis > 0)) {
        run || runState ? runAnimation() : walkAnimation();
      } else if (!canJump) {
        jumpIdleAnimation();
      }
      if (rayHit == null && isFalling) {
        fallAnimation();
      }
    }
  });
  return /* @__PURE__ */ jsxs(
    RigidBody,
    {
      colliders: false,
      ref: characterRef,
      position: props.position || [0, 5, 0],
      friction: props.friction || -0.5,
      ...props,
      children: [
        /* @__PURE__ */ jsx(
          CapsuleCollider,
          {
            name: "character-capsule-collider",
            args: [capsuleHalfHeight, capsuleRadius],
            collisionGroups
          }
        ),
        /* @__PURE__ */ jsxs("group", { ref: characterModelRef, userData: { camExcludeCollision: true }, children: [
          /* @__PURE__ */ jsx(
            "mesh",
            {
              position: [
                rayOriginOffest.x,
                rayOriginOffest.y,
                rayOriginOffest.z + slopeRayOriginOffest
              ],
              ref: slopeRayOriginRef,
              visible: showSlopeRayOrigin,
              userData: { camExcludeCollision: true },
              children: /* @__PURE__ */ jsx("boxGeometry", { args: [0.15, 0.15, 0.15] })
            }
          ),
          children
        ] })
      ]
    }
  );
});
export {
  EcctrlAnimation,
  EcctrlJoystick,
  Ecctrl as default,
  useFollowCam,
  useGame,
  useJoystickControls
};
//# sourceMappingURL=Ecctrl.js.map
