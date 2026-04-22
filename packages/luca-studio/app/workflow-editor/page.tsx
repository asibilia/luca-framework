import { redirect } from 'next/navigation'

/**
 * Legacy workflow editor route.
 *
 * Redirects to /pipeline for backward compatibility.
 * The pipeline page now hosts the workflow editor content.
 */
export default function WorkflowEditorRedirect() {
    redirect('/pipeline')
}
