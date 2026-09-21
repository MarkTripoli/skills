const count = document.querySelector("#count");
let value = 0;
document.querySelector("#add").addEventListener("click", () => {
  value += 2;
  count.textContent = String(value);
});
document.querySelector("#reset").addEventListener("click", () => {
  value = 0;
  count.textContent = String(value);
});
