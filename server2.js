// --- Format date yyyy-mm-dd hh:mm:ss with day and month swapped for D365 FO ---
const formatDate = (val) => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d)) return String(val);

  // Swap month and day
  const day = String(d.getMonth() + 1).padStart(2, '0'); // use month as day
  const month = String(d.getDate()).padStart(2, '0');    // use day as month
  const year = d.getFullYear();

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
