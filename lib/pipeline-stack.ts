import { Stack, StackProps, CfnParameter, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as notifications from "aws-cdk-lib/aws-codestarnotifications";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import {Asset} from "aws-cdk-lib/aws-s3-assets";

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //parameters that can be passed from the command line
    const notifyPhone = new CfnParameter(this, "notifyPhone", {
      type: "String",
      description: "The recipient phone number for pipeline notification",
      default: "+15550100",
    });

    const notificationEmail = new CfnParameter(this, "notificationEmail", {
      type: "String",
      description: "The recipient email for pipeline notifications",
      default: "john.doe@yyy.yyy",
    });

    const gitRepoName = new CfnParameter(this, "gitRepoName", {
      type: "String",
      description: "The git repository hosting application code",
      default: "sample-cluster-app",
    });

    const baseImageVersion = new CfnParameter(this, "baseImageVersion", {
      type: "String",
      description: "The docker image version",
      default: "latest",
    });

    const ecrRepoName = new CfnParameter(this, "ecrRepoName", {
      type: "String",
      description: "The name of the ecr registry",
      default: "sample-cluster-app",
    });

    //codecommit repository that will contain the containerized app to build
    const repo = new codecommit.Repository(this, `gitRepo`, {
      repositoryName: gitRepoName.valueAsString,
      description: "New repository for demo project.",
      code: codecommit.Code.fromDirectory("sample-cluster-app/", "main"),
    });

    //sns topic for pipeline notifications
    const pipelineNotifications = new sns.Topic(this, "BuildNotifications");
    pipelineNotifications.addSubscription(
      new subscriptions.SmsSubscription(`${notifyPhone.valueAsString}`)
    );
    pipelineNotifications.addSubscription(
      new subscriptions.EmailSubscription(`${notificationEmail.valueAsString}`)
    );

    //docker repository to store container images
    const registry = new ecr.Repository(this, `sample-cluster-app`, {
      repositoryName: ecrRepoName.valueAsString,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.DESTROY
    });
    
     //name of target EKS cluster
    const clusterName = new CfnParameter(this, "clusterName", {
      type: "String",
      description: "The name of the eks cluster",
      default: "stk-gameservers",
    });

    //unit test project in codeBuild
    const unitTestProject = new codebuild.Project(this, `codeBuildUnitTest`, {
      environment: {
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: ["npm install", "npm test"],
          },
        },
        reports: {
          myReport: {
            files: "**/*",
            "base-directory": "./test-results",
          },
        },
      }),
    });
    
    //create a roleARN for codebuild 
    const deployRole = new iam.Role(this, 'codeBuildDeployRole', { roleName: "codeBuildDeployRole",
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    
     //create a deployment policy with permissions to read and write ssm parameters
     deployRole.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['ssm:GetParameter','ssm:PutParameter'],
    }));
    
    
 
    //codebuild project to build docker containers
    // we are reading the build spec from the code, but you could also read it from a file
    // that way the build commands are abstracted from the pipeline
    const buildproject = new codebuild.Project(this, `dockerBuild`, {
      environment: {
        privileged: true,
        //uncomment the next line to build a container for Linux ARM
        // buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_ARM_2,
      },
      role: deployRole,
      cache: codebuild.Cache.local(
        codebuild.LocalCacheMode.DOCKER_LAYER,
        codebuild.LocalCacheMode.CUSTOM
      ),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              `TAG=$(date +'%Y%m%d%H%M%S')`,
              `docker build -t ${this.account}.dkr.ecr.${this.region}.amazonaws.com/${registry.repositoryName}:$TAG .`,
              `aws ecr get-login-password --region ${this.region} | docker login --username AWS --password-stdin ${this.account}.dkr.ecr.${this.region}.amazonaws.com/${registry.repositoryName}`,
              `docker push ${this.account}.dkr.ecr.${this.region}.amazonaws.com/${registry.repositoryName}:$TAG`,
              `aws ssm put-parameter --type String --name ${ gitRepoName.valueAsString }-image-latest-tag --value $TAG --overwrite`
            ],
          },
        },
        artifacts: {
          files: ["imageDetail.json"],
        },
      }),
    });
    
    //giving permissions to codebuild for eks
    deployRole.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: ['eks:ListClusters','eks:DescribeCluster'],
    }));
    
    //Generating output command to run by the end user that will grant permissions to deploy to target EKS cluster
   new CfnOutput(this, 'iamidentitymapping command', { value: `eksctl create iamidentitymapping --cluster ${  clusterName.valueAsString } --region ${ this.region  } --arn ${ deployRole.roleArn } --group system:masters` });

    //create a project to deploy the container image to the target EKS cluster using codebuild
    const deployproject = new codebuild.Project(this, `dockerDeploy`, {
      environment: {
        privileged: true
      },
      role: deployRole,
      
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          build: {
            commands: [
              `export AWS_REGION=${ this.region  }`,
              `export AWS_ACCOUNT_ID=${ this.account }`,
              `curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_$(uname -s)_amd64.tar.gz" | tar xz -C /tmp`,
              `mv /tmp/eksctl /usr/local/bin`,
              `aws eks update-kubeconfig --region ${ this.region } --name ${ clusterName.valueAsString }`,
              `export IMAGE_TAG=$(aws ssm get-parameter --name ${ gitRepoName.valueAsString }-image-latest-tag | jq '.Parameter.Value' | tr -d '"')`,
              `envsubst < sample-cluster-app-deployment.yml | kubectl apply -f -`
            ],
          },
        },
        artifacts: {
          files: ["imageDetail.json"],
        },
      }),
    });
    
    //we allow the buildProject principal to push images to ecr
    registry.grantPullPush(buildproject.grantPrincipal);

    // here we define our pipeline and put together the assembly line
    // using each of the components we created earlier
    const sourceOuput = new codepipeline.Artifact();
    const pipeline = new codepipeline.Pipeline(this, `containerPipeline`, {
      stages: [
        {
          stageName: "Source",
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: "CodeCommit_Source",
              repository: repo,
              output: sourceOuput,
              branch: "main",
            }),
          ],
        },
        {
          stageName: "UnitTest",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "Test_Code",
              input: sourceOuput,
              project: unitTestProject,
            }),
          ],
        },
        {
          stageName: "DockerBuild",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "Build_Code",
              input: sourceOuput,
              project: buildproject,
            }),
          ],
        },
        {
          stageName: "EKSDeployment",
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: "Deploy_Code",
              input: sourceOuput,
              project: deployproject,
            }),
          ],
        },
      ],
    });

    //notification rules to alert end users on pipeline activities
    const unitTestNotificationRule = new notifications.NotificationRule(
      this,
      "unitTestNotificationRule",
      {
        source: unitTestProject,
        events: [
          "codebuild-project-build-state-succeeded",
          "codebuild-project-build-state-failed",
        ],
        targets: [pipelineNotifications],
      }
    );

    const buildNotificationRule = new notifications.NotificationRule(
      this,
      "buildNotificationRule",
      {
        source: buildproject,
        events: [
          "codebuild-project-build-state-succeeded",
          "codebuild-project-build-state-failed",
        ],
        targets: [pipelineNotifications],
      }
    );
    
    const deployNotificationRule = new notifications.NotificationRule(this, 'deployNotificationRule', {
    source: deployproject,
    events: [
      'codebuild-project-build-state-succeeded',
      'codebuild-project-build-state-failed',
    ],
    targets: [pipelineNotifications],
  });
  }
}
