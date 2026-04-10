# Implement Custom Camera Capture Modal

## Goal Description
The user wants a more direct camera experience when adding "Before" and "After" photos, feeling that the native file picker via `capture="environment"` is not immediate enough or potentially confusing ("opens to upload phto"). To address this, we will implement a custom in-app camera modal using `getUserMedia`.

## Proposed Changes
### Frontend
#### [NEW] [CameraCaptureModal.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/frontend/components/shared/CameraCaptureModal.tsx)
- Create a reusable modal component that:
    - Requests camera permissions.
    - Displays a live video feed (`<video>`).
    - Provides a "Capture" button to snap a photo (`<canvas>`).
    - Supports switching cameras (if multiple available).
    - Returns a `File` object to the parent component.
    - Handles errors (e.g., no camera found).

#### [MODIFY] [page.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/tickets/[ticketId]/page.tsx)
- Import `CameraCaptureModal`.
- Add state to track which photo (before/after) is being captured.
- Update "Camera" button to open this modal instead of the file input.
- Reuse the existing upload logic to process the captured file.

## Verification Plan
### Manual Verification
- Test on Desktop: Verify clicking "Camera" opens the modal and shows the webcam feed.
- Test on Mobile (if possible via resizing/simulation, otherwise rely on code correctness for `getUserMedia`): Verify layout constraints.
- Verify that capturing an image correctly updates the ticket photo.
