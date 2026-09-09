import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import DashboardModal from "@uppy/react/dashboard-modal";
import "@uppy/core/css/style.min.css";
import "@uppy/dashboard/css/style.min.css";
import AwsS3 from "@uppy/aws-s3";
/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 *
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for:
 *   - File selection
 *   - File preview
 *   - Upload progress tracking
 *   - Upload status display
 *
 * The component uses Uppy v5 under the hood to handle all file upload functionality.
 * All file management features are automatically handled by the Uppy dashboard modal.
 *
 * @param props - Component props
 * @param props.maxNumberOfFiles - Maximum number of files allowed to be uploaded
 *   (default: 1)
 * @param props.maxFileSize - Maximum file size in bytes (default: 10MB)
 * @param props.onGetUploadParameters - Function to get upload parameters for each file.
 *   Receives the UppyFile object with file.name, file.size, file.type properties.
 *   Use these to request per-file presigned URLs from your backend. Returns method,
 *   url, and optional headers for the upload request.
 * @param props.onComplete - Callback function called when upload is complete. Typically
 *   used to make post-upload API calls to update server state and set object ACL
 *   policies.
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.children - Content to be rendered inside the button
 */
export function ObjectUploader({ maxNumberOfFiles = 1, maxFileSize = 10485760, // 10MB default
onGetUploadParameters, onComplete, buttonClassName, children, }) {
    const onCompleteRef = useRef(onComplete);
    const onGetUploadParametersRef = useRef(onGetUploadParameters);
    useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
    useEffect(() => { onGetUploadParametersRef.current = onGetUploadParameters; }, [onGetUploadParameters]);
    const [showModal, setShowModal] = useState(false);
    const [uppy] = useState(() => new Uppy({
        restrictions: {
            maxNumberOfFiles,
            maxFileSize,
        },
        autoProceed: false,
    })
        .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: (file) => onGetUploadParametersRef.current(file),
    })
        .on("complete", (result) => {
        onCompleteRef.current?.(result);
    }));
    return (_jsxs("div", { children: [_jsx("button", { onClick: () => setShowModal(true), className: buttonClassName, children: children }), _jsx(DashboardModal, { uppy: uppy, open: showModal, onRequestClose: () => setShowModal(false), proudlyDisplayPoweredByUppy: false })] }));
}
