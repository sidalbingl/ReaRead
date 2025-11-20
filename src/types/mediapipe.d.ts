/**
 * MediaPipe Tasks Vision Type Definitions
 * Extended types for our custom usage
 */

declare module '@mediapipe/tasks-vision' {
  export interface FaceLandmarkerOptions {
    baseOptions: {
      modelAssetPath: string;
      delegate?: 'CPU' | 'GPU';
    };
    runningMode: 'IMAGE' | 'VIDEO';
    numFaces?: number;
    minFaceDetectionConfidence?: number;
    minFacePresenceConfidence?: number;
    minTrackingConfidence?: number;
    outputFaceBlendshapes?: boolean;
    outputFacialTransformationMatrixes?: boolean;
  }

  export interface NormalizedLandmark {
    x: number;
    y: number;
    z?: number;
    visibility?: number;
  }

  export interface FaceLandmarkerResult {
    faceLandmarks: NormalizedLandmark[][];
    faceBlendshapes?: any[];
    facialTransformationMatrixes?: any[];
  }

  export class FaceLandmarker {
    static createFromOptions(
      vision: any,
      options: FaceLandmarkerOptions
    ): Promise<FaceLandmarker>;

    detectForVideo(
      video: HTMLVideoElement,
      timestamp: number
    ): FaceLandmarkerResult;

    close(): Promise<void>;
  }

  export class FilesetResolver {
    static forVisionTasks(basePath: string): Promise<any>;
  }
}
