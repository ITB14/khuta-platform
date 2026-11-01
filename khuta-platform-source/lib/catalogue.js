// النوع يختار جدولًا من قائمة مغلقة لا يُركَّب من نصّ الطلب. جدولان فقط،
// ومن أرسل غيرهما يُردّ قبل أن يصل اسمُه إلى جملة SQL.
const TABLE = { category: 'course_category', provider: 'provider' };

module.exports = { TABLE };
