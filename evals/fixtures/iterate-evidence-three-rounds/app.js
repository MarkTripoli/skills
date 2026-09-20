const countA = document.querySelector("#count-A");
let valueA = 0;
document.querySelector("#add-A").addEventListener("click", () => {
  valueA += 2;
  countA.textContent = String(valueA);
});
document.querySelector("#reset-A").addEventListener("click", () => {
  valueA = 0;
  countA.textContent = String(valueA);
});

const countB = document.querySelector("#count-B");
let valueB = 0;
document.querySelector("#add-B").addEventListener("click", () => {
  valueB += 2;
  countB.textContent = String(valueB);
});
document.querySelector("#reset-B").addEventListener("click", () => {
  valueB = 0;
  countB.textContent = String(valueB);
});

const countC = document.querySelector("#count-C");
let valueC = 0;
document.querySelector("#add-C").addEventListener("click", () => {
  valueC += 2;
  countC.textContent = String(valueC);
});
document.querySelector("#reset-C").addEventListener("click", () => {
  valueC = 0;
  countC.textContent = String(valueC);
});

const countD = document.querySelector("#count-D");
let valueD = 0;
document.querySelector("#add-D").addEventListener("click", () => {
  valueD += 2;
  countD.textContent = String(valueD);
});
document.querySelector("#reset-D").addEventListener("click", () => {
  valueD = 0;
  countD.textContent = String(valueD);
});
