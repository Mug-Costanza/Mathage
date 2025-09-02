const tf = require('@tensorflow/tfjs-node');

// 1️⃣ Load MNIST dataset
async function loadMnistData() {
  const mnist = require('mnist');  // lightweight JS MNIST loader
  const { training, test } = mnist.set(60000, 10000);

  const xTrain = training.map(d => d.input); // flat 784 array
  const yTrain = training.map(d => d.output); // one-hot

  const xTest = test.map(d => d.input);
  const yTest = test.map(d => d.output);

  return {
    xTrain: tf.tensor2d(xTrain).reshape([-1,28,28,1]),
    yTrain: tf.tensor2d(yTrain),
    xTest: tf.tensor2d(xTest).reshape([-1,28,28,1]),
    yTest: tf.tensor2d(yTest)
  };
}

// 2️⃣ Build the model
function createModel() {
  const model = tf.sequential();

  model.add(tf.layers.conv2d({
    inputShape: [28,28,1],
    filters: 32,
    kernelSize: 3,
    activation: 'relu'
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.conv2d({filters:64, kernelSize:3, activation:'relu'}));
  model.add(tf.layers.maxPooling2d({poolSize: [2,2]}));
  model.add(tf.layers.dropout({rate:0.25}));

  model.add(tf.layers.conv2d({filters:128, kernelSize:3, activation:'relu'}));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.maxPooling2d({poolSize:[2,2]}));
  model.add(tf.layers.dropout({rate:0.25}));

  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({units:256, activation:'relu'}));
  model.add(tf.layers.dropout({rate:0.5}));
  model.add(tf.layers.dense({units:10, activation:'softmax'}));

  model.compile({
    optimizer: tf.train.adam(),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });

  return model;
}

// 3️⃣ Optional: class weighting for 3,5,7,9
const classWeights = {0:1,1:1,2:1,3:1.3,4:1,5:1.3,6:1,7:1.3,8:1,9:1.3};

// 4️⃣ Train the model
async function train() {
  const {xTrain, yTrain, xTest, yTest} = await loadMnistData();
  const model = createModel();

  // Data augmentation helper
  const batchSize = 64;
  const epochs = 20;

  await model.fit(xTrain, yTrain, {
    batchSize,
    epochs,
    validationData: [xTest, yTest],
    classWeight: classWeights,
    shuffle: true
  });

  // Save model for browser
  await model.save('file://./mnist_model_tfjs'); 
  console.log('✅ Model saved as mnist_model_tfjs/model.json');
}

train();

