# Welcome to the EKS sample container pipeline

This is a CDK TypeScript project that packages a [Cluster Sample App](https://github.com/sdpoueme/cluster-sample-app) into a container. Containers are a great fit for workloads because they’re lightweight, start quickly, and optimize the utilization of the underlying instance. The Sample App container is a quick start solution that can be used to bootstrap kubernetes projects.


**Note: you must have an EKS cluster deployed as pre-requisite. You can follow the instructions defined [here](https://eksctl.io/usage/creating-and-managing-clusters/) to create a cluster.**

To get started with this project.

1. Clone the repository to your local workstation

2. Install CDK 
```npm install aws-cdk-lib```

3. Bootstrap CDK 
```cdk bootstrap```

4. Install the required packages:
```npm install```

5. Export environment variables that will be used in the next steps:
```export CLUSTER_NAME=mycluster
   export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
   export GIT_REPO=myDemo
   export AWS_REGION=us-east-1
```

Note: You can change the region to reflect the location where you want to deploy the code sample. 

6. Execute the following command to allow CodeBuild to deploy the sample application on EKS: 

```eksctl create iamidentitymapping --cluster ${CLUSTER_NAME} --region ${AWS_REGION} --arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/codeBuildDeployRole --group system:masters```

7. Deploy the code sample to create the end-to-end CI/CD pipeline: 
 
```cdk deploy --parameters notificationEmail=xxx@yyy.com --parameters notifyPhone=+9999999999 --parameters gitRepoName=${GIT_REPO} --parameters clusterName=${CLUSTER_NAME}```

The code sample deploys the following resources:

* CodeCommit repository to store the Sample App
* ECR registry to store the Sample App image
* CodeBuild project to build Sample App images on ARM or x86
* SNS Notifications to update end users on the status of the build
* CodePipeline to perform the build stages and release to production
* Unit tests definition and a report group to display unit tests results in CodeBuild
* CodeBuild project to deploy a container to EKS
