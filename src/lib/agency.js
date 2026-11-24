// The organization someone works for: their solar system's name on emails
// (Big Insurance Network, Big Huge Business, Elite Financial Services).
// Set once their profile loads; texts to clients and the Chat rules use it.
const BIG = 'Big Insurance Network';
let name = BIG;
export const agencyName = () => name;
export function setAgencyName(n) { name = (n && String(n).trim()) || BIG; }
