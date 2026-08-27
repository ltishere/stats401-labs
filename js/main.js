console.log("Hello STATS 401!");

let course = "STATS 401";
let students = 40;

console.log(course);
console.log(students);

// --- 数组 ---
let data = [10, 20, 30, 40, 50];

console.log(data);

// --- 对象 ---
let student = {
    name: "Alice",
    score: 85
};

console.log(student.name);
console.log(student.score);

// --- 数组套对象 ---
let studentList = [
    {name: "Alice", score: 85},
    {name: "Bob", score: 72},
    {name: "Carol", score: 91}
];

console.log(studentList);
console.log("D3 version:", d3.version);
d3.select("#message")
    .text("This text was changed using D3!");