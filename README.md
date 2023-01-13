# Welcome to the EKS sample container pipeline

This is a CDK TypeScript project that packages a [Cluster Sample App](https://github.com/sdpoueme/cluster-sample-app) into a container. Containers are a great fit for workloads because they’re lightweight, start quickly, and optimize the utilization of the underlying instance. The Sample App container is a quick start solution that can be used to bootstrap kubernetes projects.


**Note: you must have an EKS cluster deployed as pre-requisite. You can follow the instructions defined [here](https://eksctl.io/usage/creating-and-managing-clusters/) to create a cluster.**

To get started with this project.

* Clone the repo
* Install CDK `npm install aws-cdk-lib`
* Bootstrap cdk `cdk bootstrap`
* Run `npm install`
* Run `export CLUSTER_NAME=mycluster`
* Run `export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"`
* Run `export GIT_REPO=myDemo`
* Run `export AWS_REGION=us-east-1`
Note: You can change the region to reflect the location where you want to deploy the code sample. 
* Execute the following command to allow CodeBuild to deploy the sample application on EKS: `PipelineStack.iamidentitymappingcommand = eksctl create iamidentitymapping --cluster ${CLUSTER_NAME} --region ${AWS_REGION} --arn arn:aws:iam::${AWS_ACCOUNT_ID}:role/codeBuildDeployRole --group system:masters`
* Run `cdk deploy --parameters notificationEmail=xxx@yyy.com --parameters notifyPhone=+9999999999 --parameters gitRepoName=${GIT_REPO} --parameters clusterName=${CLUSTER_NAME}`

The stack deploys the following resources:

* Git repository to store the Sample App
* ECR registry to store the Sample App image
* CodeBuild project to build Sample App images on ARM or x86
* SNS Notifications to update end users on the status of the build
* CodePipeline to perform the build stages and release to production
* Unit tests definition and a report group to display unit tests results in CodeBuild
