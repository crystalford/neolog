import { redirect } from 'next/navigation'
export const runtime = 'edge'
export default function UploadsRedirect() { redirect('/vlogs') }
