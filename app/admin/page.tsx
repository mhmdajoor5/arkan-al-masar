import ArkanApp from '../arkan-app';
import StaffAccess from '../staff-access';
export const dynamic='force-dynamic';
export default function AdminPage(){return <StaffAccess area="admin"><ArkanApp initialView="admin"/></StaffAccess>}
