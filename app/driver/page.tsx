import StaffAccess from '../staff-access';
import DriverPanel from '../driver-panel';
export const dynamic='force-dynamic';
export default function DriverPage(){return <StaffAccess area="driver"><DriverPanel/></StaffAccess>}
