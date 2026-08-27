const rInner = 20;
const rOuter = 26;
const rBump = 32;
const bumpAngle1 = 18;
const bumpAngle2 = 10;

let path = '';
for (let i = 0; i < 3; i++) {
  const angle = -Math.PI / 2 + i * (2 * Math.PI / 3);
  
  const a1 = angle - (bumpAngle1 * Math.PI / 180);
  const a2 = angle - (bumpAngle2 * Math.PI / 180);
  const a3 = angle + (bumpAngle2 * Math.PI / 180);
  const a4 = angle + (bumpAngle1 * Math.PI / 180);
  const a5 = angle + (2 * Math.PI / 3) - (bumpAngle1 * Math.PI / 180);
  
  if (i === 0) {
    path += "M " + (rOuter * Math.cos(a1).toFixed(3)) + " " + (rOuter * Math.sin(a1).toFixed(3)) + " ";
  }
  
  path += "L " + (rBump * Math.cos(a2).toFixed(3)) + " " + (rBump * Math.sin(a2).toFixed(3)) + " ";
  path += "L " + (rBump * Math.cos(a3).toFixed(3)) + " " + (rBump * Math.sin(a3).toFixed(3)) + " ";
  path += "L " + (rOuter * Math.cos(a4).toFixed(3)) + " " + (rOuter * Math.sin(a4).toFixed(3)) + " ";
  path += "A " + rOuter + " " + rOuter + " 0 0 1 " + (rOuter * Math.cos(a5).toFixed(3)) + " " + (rOuter * Math.sin(a5).toFixed(3)) + " ";
}
path += 'Z';
console.log(path);
